import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, Calculator, CheckCircle2, Minus, Pencil, Plus, TriangleAlert, X } from 'lucide-react';
import Modal from '../../../components/Modal';
import { listRepassesDfc } from '../../../api/dfcRepasses.api';
import { formatarDataISO } from '../../../utils/datas';
import RegistroManualModal from './RegistroManualModal';

// Colunas da tabela: as do Geral dos Empreendimentos (sem cálculo) e, no fim, a Demanda Mínima e
// a calculadora — as colunas calculadas não ficam na grade (pedido do usuário: ficava grande
// demais), aparecem por cliente na janela da calculadora. `soma`: entra no total do empreendimento.
const COLUNAS = [
  { id: 'mutuario', label: 'Mutuário', tipo: 'texto', largura: 320 },
  { id: 'data_assinatura', label: 'Data Assinatura', tipo: 'data', largura: 105 },
  {
    id: 'data_registro',
    label: 'Data Registro',
    tipo: 'registro',
    largura: 150,
    titulo: 'Sem registro no Geral: o mês projetado — assinatura + "Tempo Entre Assinatura e Registro" (Parâmetros) ou o informado à mão. Clique para alterar.',
  },
  { id: 'valor_financiamento', label: 'Valor Financiamento', tipo: 'moeda', soma: true },
  { id: 'valor_terreno', label: 'Valor Terreno', tipo: 'moeda', soma: true },
  { id: 'valor_subsidio', label: 'Valor Subsídio', tipo: 'moeda', soma: true },
  { id: 'valor_fgts', label: 'Valor FGTS', tipo: 'moeda', soma: true },
  { id: 'valor_avaliacao', label: 'Valor Avaliação', tipo: 'moeda', soma: true },
  {
    id: 'demanda_minima',
    label: 'Demanda Mínima',
    tipo: 'status',
    largura: 115,
    titulo: 'SIM quando a data de assinatura é igual ou anterior à Data da Demanda Mínima',
  },
  { id: 'calculo', label: '', tipo: 'calculo', largura: 48 },
];
const LARGURA_PADRAO = 125;
const largura = (c) => c.largura || LARGURA_PADRAO;
const LARGURA_TOTAL = COLUNAS.reduce((s, c) => s + largura(c), 0);
// A primeira coluna (Mutuário / empreendimento) fica presa à esquerda ao rolar na horizontal.

function vazio(v) {
  return v === null || v === undefined;
}

function dinheiro(v) {
  return vazio(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatar(coluna, v) {
  if (vazio(v) || v === '') return '—';
  if (coluna.tipo === 'data') return formatarDataISO(v);
  if (coluna.tipo === 'moeda') return dinheiro(v);
  return String(v);
}

function rotuloMes(data) {
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [ano, mes] = String(data).slice(0, 7).split('-');
  return `${MESES[Number(mes) - 1]}/${ano}`;
}

// Mês atual em Brasília ('AAAA-MM').
const mesAtual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);

// Coluna "Data Registro": a data do Geral; sem ela, o mês projetado (etiqueta "projetado" = pelo
// parâmetro, "manual" = informado à mão) — clique abre a janela pra informar outro mês. Mês projetado
// que já passou (cliente ainda sem registro) fica em vermelho.
function CelulaRegistro({ unidade: u, onEditar }) {
  if (u.registro_origem === 'REGISTRO') return formatarDataISO(u.data_registro);
  if (!u.registro_origem) {
    return (
      <span className="text-gray-300" title={u.data_assinatura ? 'Sem "Tempo Entre Assinatura e Registro" nos Parâmetros da obra' : 'Sem data de assinatura'}>
        —
      </span>
    );
  }
  const manual = u.registro_origem === 'MANUAL';
  const passou = u.registro_mes < mesAtual();
  const dica = manual
    ? `Informado à mão${u.registro_manual?.usuario ? ` por ${u.registro_manual.usuario}` : ''}. Pelo parâmetro seria ${
        u.registro_parametro_mes ? rotuloMes(u.registro_parametro_mes) : '—'
      }.`
    : 'Projetado: assinatura + "Tempo Entre Assinatura e Registro" (Parâmetros da obra).';
  return (
    <button
      type="button"
      onClick={onEditar}
      title={`${dica}${passou ? ' O mês já passou e o cliente não foi registrado.' : ''} Clique para alterar.`}
      className="group/reg inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-primary-50"
    >
      <span className={`tabular-nums ${passou ? 'font-medium text-red-600' : 'text-gray-700'}`}>{rotuloMes(u.registro_mes)}</span>
      <span
        className={`rounded-full px-1.5 py-px text-[10px] font-medium ${
          manual ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' : 'bg-sky-50 text-sky-700 ring-1 ring-sky-100'
        }`}
      >
        {manual ? 'manual' : 'projetado'}
      </span>
      <Pencil size={11} className="text-gray-300 group-hover/reg:text-primary-600" />
    </button>
  );
}

function StatusDemanda({ valor }) {
  if (vazio(valor)) return <span className="text-gray-300">—</span>;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        valor ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {valor ? 'SIM' : 'NÃO'}
    </span>
  );
}

// Uma linha da janela da calculadora: nome, fórmula com os números do cliente e o resultado.
function LinhaCalculo({ nome, formula, resultado, destaque = false }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)_120px] items-baseline gap-3 border-t border-gray-100 py-2.5 first:border-t-0">
      <p className={`text-xs ${destaque ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>{nome}</p>
      <p className="text-xs leading-relaxed text-gray-500">{formula}</p>
      <p className={`text-right text-sm tabular-nums ${destaque ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>{resultado}</p>
    </div>
  );
}

// Janela com as colunas calculadas do cliente (fórmulas do backend — dfc-repasses), cada uma com
// os números dele aplicados na fórmula.
function CalculoModal({ unidade, empreendimento, onClose }) {
  if (!unidade) return null;
  const u = unidade;
  const pct = u.pct_obra_acumulado;
  const demanda = empreendimento.data_demanda_minima;
  return (
    <Modal open onClose={onClose} title="Cálculo do repasse" maxWidthClass="max-w-2xl">
      <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2.5">
        <p className="text-sm font-semibold text-gray-900">{u.mutuario || '—'}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          Contrato {u.contrato_mutuario} · {empreendimento.name} · Assinatura {formatarDataISO(u.data_assinatura)} ·{' '}
          {u.data_registro
            ? `Registro ${formatarDataISO(u.data_registro)}`
            : u.registro_mes
              ? `Registro projetado em ${rotuloMes(u.registro_mes)} (${u.registro_origem === 'MANUAL' ? 'manual' : 'parâmetro'})`
              : 'Sem registro'}
        </p>
      </div>

      <div>
        <LinhaCalculo
          nome="% Obra Acumulado"
          formula={
            vazio(pct)
              ? !u.data_registro
                ? `Ainda sem registro${u.registro_mes ? ` (projetado em ${rotuloMes(u.registro_mes)}; o % de obra desse mês entra na Projeção CEF)` : ''} — aqui não há % de obra a considerar.`
                : 'Sem DCD liberado do contrato — não há avanço PLS.'
              : `Avanço PLS (DCD) acumulado em ${rotuloMes(u.data_registro)}, mês da data de registro.`
          }
          resultado={vazio(pct) ? '—' : `${dinheiro(pct)}%`}
        />
        <LinhaCalculo
          nome="VGF"
          formula={`Financiamento ${dinheiro(u.valor_financiamento)} + Subsídio ${dinheiro(u.valor_subsidio)} + FGTS ${dinheiro(u.valor_fgts)}`}
          resultado={dinheiro(u.vgf)}
        />
        <LinhaCalculo
          nome="Medição Total"
          formula={`(Financiamento ${dinheiro(u.valor_financiamento)} − Terreno ${dinheiro(u.valor_terreno)}) + Subsídio ${dinheiro(u.valor_subsidio)}`}
          resultado={dinheiro(u.medicao_total)}
        />
        <LinhaCalculo
          nome="Novo Registro"
          formula={`Terreno ${dinheiro(u.valor_terreno)} + FGTS ${dinheiro(u.valor_fgts)}`}
          resultado={dinheiro(u.novo_registro)}
        />
        <LinhaCalculo
          nome="Medição"
          formula={
            vazio(pct)
              ? 'Medição Total × % Obra Acumulado — sem % de obra, não calculada.'
              : `Medição Total ${dinheiro(u.medicao_total)} × % Obra Acumulado ${dinheiro(pct)}%`
          }
          resultado={dinheiro(u.medicao)}
        />
        <LinhaCalculo
          nome="Novo Registro Total"
          formula={
            vazio(u.medicao)
              ? 'Novo Registro + Medição — sem Medição, não calculado.'
              : `Novo Registro ${dinheiro(u.novo_registro)} + Medição ${dinheiro(u.medicao)}`
          }
          resultado={dinheiro(u.novo_registro_total)}
          destaque
        />
        <LinhaCalculo
          nome="Demanda Mínima"
          formula={
            !demanda
              ? 'Sem Data da Demanda Mínima (Parâmetros ou DCD) — não dá pra classificar.'
              : `Assinatura ${formatarDataISO(u.data_assinatura)} ${u.demanda_minima ? 'igual ou anterior' : 'posterior'} à Data da Demanda Mínima ${formatarDataISO(demanda)} (${
                  empreendimento.origem_demanda_minima === 'PARAMETROS' ? 'Parâmetros' : 'DCD'
                })`
          }
          resultado={<StatusDemanda valor={u.demanda_minima} />}
        />
      </div>
    </Modal>
  );
}

// Operações > DFC Construtoras > Repasses: as unidades do Geral dos Empreendimentos de cada
// empreendimento (centro de custo com Código Contrato Caixa), sem o primeiro contrato por data de
// assinatura (o da construtora). Drilldown igual ao da aba Avanços: nível 1 = empreendimento
// (com os totais), nível 2 = cada unidade. As colunas calculadas ficam na janela da calculadora
// (fim da linha). Começa tudo fechado; com busca, abre os empreendimentos que têm unidade encontrada.
// Cliente sem registro: a coluna Data Registro mostra o mês projetado e permite informar outro, cliente a
// cliente (RegistroManualModal) — a Projeção CEF da obra é recalculada com ele.
export default function DfcRepassesTab({ empresaId, search = '' }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [abertos, setAbertos] = useState([]);
  const [calculo, setCalculo] = useState(null); // { unidade, empreendimento }
  const [registro, setRegistro] = useState(null); // { unidade, empreendimento } — janela do mês do registro
  const [aviso, setAviso] = useState(null); // { tipo: 'ok' | 'atencao', texto } depois de salvar

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErroCarga('');
    listRepassesDfc(empresaId)
      .then(setDados)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar os repasses.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setDados(null);
    setAbertos([]);
    carregar();
  }, [carregar]);

  const termo = search.trim().toLowerCase();
  const empreendimentos = useMemo(() => {
    const lista = dados || [];
    if (!termo) return lista;
    return lista
      .map((e) => ({
        ...e,
        unidades: e.unidades.filter(
          (u) => (u.mutuario || '').toLowerCase().includes(termo) || String(u.contrato_mutuario || '').includes(termo)
        ),
      }))
      .filter((e) => e.unidades.length > 0);
  }, [dados, termo]);

  // Mês salvo: recarrega a grade (o mês e a etiqueta vêm do backend) e conta o que aconteceu.
  function registroSalvo(resposta, mes) {
    const { unidade, empreendimento } = registro;
    setRegistro(null);
    const quem = unidade.mutuario || `contrato ${unidade.contrato_mutuario}`;
    const oQue = mes ? `${quem} projetado para ${rotuloMes(mes)}` : `${quem} voltou ao mês do parâmetro`;
    setAviso(
      resposta.aviso
        ? { tipo: 'atencao', texto: `${oQue}. ${resposta.aviso}` }
        : {
            tipo: 'ok',
            texto: `${oQue}. Projeção CEF de ${empreendimento.name} recalculada — entra no Orçamento na próxima versão salva (Nova versão).`,
          }
    );
    carregar();
  }

  function alternar(id) {
    setAbertos((atual) => (atual.includes(id) ? atual.filter((v) => v !== id) : [...atual, id]));
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Banknote size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver os repasses dos empreendimentos.</p>
      </div>
    );
  }

  const alinhamento = (c) => (c.tipo === 'moeda' ? 'text-right' : c.tipo === 'texto' ? '' : 'text-center');

  return (
    // min-w-fit: com tabela mais larga que a tela, o quadro branco cresce junto (e a página rola na
    // horizontal) em vez de a tabela vazar pra fora dele.
    <div className="min-w-fit rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {aviso && (
        <div
          role="status"
          className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
            aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {aviso.tipo === 'ok' ? <CheckCircle2 size={14} className="mt-px shrink-0" /> : <TriangleAlert size={14} className="mt-px shrink-0" />}
          <span className="min-w-0 flex-1">{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso" className="shrink-0 opacity-60 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}
      {carregando && !dados ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : erroCarga ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <TriangleAlert size={26} className="text-red-400" />
          <p className="text-sm text-gray-600">{erroCarga}</p>
          <button
            type="button"
            onClick={carregar}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        // Sem wrapper com overflow próprio (mesmo motivo do Espião NFe / NFSe): qualquer overflow aqui
        // vira o "teto" do sticky e o cabeçalho deixaria de grudar no topo da página ao rolar. -top-6
        // cancela o p-6 do <main>. Tela estreita rola na barra da própria página.
        <div>
          <table
            className="border-separate border-spacing-0 text-left text-xs"
            style={{ tableLayout: 'fixed', width: '100%', minWidth: LARGURA_TOTAL }}
          >
            <colgroup>
              {COLUNAS.map((c) => (
                <col key={c.id} style={{ width: largura(c) }} />
              ))}
            </colgroup>
            <thead>
              <tr className="[&>th:first-child]:rounded-tl-lg [&>th:last-child]:rounded-tr-lg">
                {COLUNAS.map((c, i) => (
                  <th
                    key={c.id}
                    title={c.titulo}
                    className={`sticky -top-6 border-b-2 border-b-blue-500 bg-blue-50 px-2 py-2.5 text-[11px] font-medium uppercase tracking-wide text-blue-700 ${
                      i === 0 ? 'left-0 z-30 border-r border-r-blue-100 pl-4' : 'z-20 border-l border-l-blue-100'
                    } ${alinhamento(c)}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {empreendimentos.length === 0 && (
                <tr>
                  <td colSpan={COLUNAS.length} className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
                    {termo
                      ? 'Nenhuma unidade encontrada para essa busca.'
                      : 'Nenhum centro de custo com Código Contrato Caixa. Informe na aba Centros Custos.'}
                  </td>
                </tr>
              )}
              {empreendimentos.map((e) => {
                const temUnidades = e.unidades.length > 0;
                const aberto = temUnidades && (termo ? true : abertos.includes(e.sienge_id));
                const qtdDemanda = e.unidades.filter((u) => u.demanda_minima === true).length;
                return (
                  <Fragment key={e.sienge_id}>
                    {/* Nível 1: empreendimento, com os totais */}
                    <tr
                      onClick={() => temUnidades && !termo && alternar(e.sienge_id)}
                      className={`group/emp ${temUnidades && !termo ? 'cursor-pointer' : ''}`}
                    >
                      <td
                        className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-50 py-2 pl-3 pr-2 group-hover/emp:bg-gray-100"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                              temUnidades ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-300'
                            }`}
                          >
                            {aberto ? <Minus size={10} /> : <Plus size={10} />}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-xs font-semibold text-gray-900" title={e.name}>
                                {e.name}
                              </span>
                              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                                {e.unidades.length}
                              </span>
                            </span>
                            {!temUnidades && (
                              <span className="block truncate text-[10px] text-gray-400">Geral não importado</span>
                            )}
                          </span>
                        </span>
                      </td>
                      {COLUNAS.slice(1).map((c) => {
                        let conteudo = '';
                        if (c.soma && temUnidades) {
                          const valores = e.unidades.map((u) => u[c.id]).filter((v) => !vazio(v));
                          conteudo = valores.length ? dinheiro(valores.reduce((s, v) => s + Number(v), 0)) : '—';
                        } else if (c.tipo === 'status' && temUnidades) {
                          conteudo = `${qtdDemanda} sim`;
                        } else if (c.tipo === 'registro' && temUnidades) {
                          const proj = e.unidades.filter((u) => u.registro_origem === 'PARAMETRO').length;
                          const man = e.unidades.filter((u) => u.registro_origem === 'MANUAL').length;
                          conteudo = (
                            <span className="text-[11px] font-medium text-gray-500">
                              {[proj && `${proj} proj.`, man && `${man} manual`].filter(Boolean).join(' · ')}
                            </span>
                          );
                        }
                        return (
                          <td
                            key={c.id}
                            className={`border-b border-l border-gray-200 bg-gray-50 px-2 text-xs font-semibold tabular-nums text-gray-900 group-hover/emp:bg-gray-100 ${alinhamento(c)}`}
                          >
                            {conteudo}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Nível 2: as unidades */}
                    {aberto &&
                      e.unidades.map((u) => (
                        <tr key={u.id} className="group/un">
                          {COLUNAS.map((c, i) => (
                            <td
                              key={c.id}
                              title={c.tipo === 'texto' ? u[c.id] || undefined : undefined}
                              className={`border-b border-gray-100 bg-white px-2 py-1.5 tabular-nums group-hover/un:bg-gray-50 ${
                                i === 0
                                  ? 'sticky left-0 z-10 truncate border-r border-r-gray-200 pl-9 font-medium text-gray-800'
                                  : 'border-l text-gray-700'
                              } ${alinhamento(c)} ${
                                c.tipo !== 'calculo' && c.tipo !== 'registro' && vazio(u[c.id]) ? 'text-gray-300' : ''
                              }`}
                            >
                              {c.tipo === 'status' ? (
                                <StatusDemanda valor={u[c.id]} />
                              ) : c.tipo === 'registro' ? (
                                <CelulaRegistro unidade={u} onEditar={() => setRegistro({ unidade: u, empreendimento: e })} />
                              ) : c.tipo === 'calculo' ? (
                                <button
                                  type="button"
                                  onClick={() => setCalculo({ unidade: u, empreendimento: e })}
                                  title="Ver o cálculo deste cliente"
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-primary-50 hover:text-primary-600"
                                >
                                  <Calculator size={14} />
                                </button>
                              ) : (
                                formatar(c, u[c.id])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CalculoModal
        unidade={calculo?.unidade}
        empreendimento={calculo?.empreendimento}
        onClose={() => setCalculo(null)}
      />
      <RegistroManualModal alvo={registro} empresaId={empresaId} onClose={() => setRegistro(null)} onSalvo={registroSalvo} />
    </div>
  );
}
