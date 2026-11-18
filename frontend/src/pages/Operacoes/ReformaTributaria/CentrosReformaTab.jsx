import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Building2, TriangleAlert } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { limparCentroReforma, listCentrosReforma, salvarCentroReforma } from '../../../api/reformaTributaria.api';
import { mesAno } from '../CronogramasObras/formatos';
import { aliquota, lerNumero, moeda, paraCampo, REGIMES } from './formatos';

const CABECALHO = 'border-b-2 border-blue-500 bg-blue-50 text-xs font-medium uppercase tracking-wide text-blue-700';

// Mesmo par âmbar (vazio) / azul (preenchido) das Configurações de Cronogramas Obras e Repasses CEF.
const corCampo = (preenchido) => (preenchido ? 'border-primary-100 bg-primary-50 hover:border-primary-500' : 'border-amber-300 bg-amber-50 hover:border-amber-400');

const OPCOES_REGIME = [
  {
    value: 'RET',
    titulo: 'RET de transição',
    texto: 'A obra fica no RET (patrimônio de afetação com a opção feita até 31/12/2028): IBS/CBS e IRPJ/CSLL numa alíquota única sobre a receita, como na aba Alíquotas. Sem crédito e sem redutores.',
  },
  {
    value: 'REGULAR',
    titulo: 'Regime regular',
    texto: 'IBS/CBS com a redução dos imóveis, a base abatida pelos redutores (terreno e redutor social) e crédito sobre o custo da obra. O IRPJ/CSLL passa a ser pago fora do RET.',
  },
];

const Vazio = () => <span className="text-gray-300">—</span>;

function Projecao({ p, naDre }) {
  if (!naDre) return <span className="whitespace-nowrap text-xs text-gray-400">Fora da DRE</span>;
  if (!p) return <span className="whitespace-nowrap text-xs text-amber-600">Sem projeção da DRE</span>;
  const origem = p.origem === 'VERSAO' ? `Versão ${p.numero}` : p.status === 'CONCLUIDO' ? 'Rascunho concluído' : 'Rascunho em andamento';
  return (
    <span className="whitespace-nowrap text-xs text-gray-600">
      {origem} · até {mesAno(`${p.ciclo_fim}-01`)}
    </span>
  );
}

function Campo({ rotulo, ajuda, valor, onChange, sufixo, prefixo }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{rotulo}</label>
      <div className="flex items-center gap-2">
        {prefixo && <span className="shrink-0 whitespace-nowrap text-sm text-gray-500">{prefixo}</span>}
        <input
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-100 ${corCampo(valor !== '')}`}
        />
        {sufixo && <span className="shrink-0 whitespace-nowrap text-sm text-gray-500">{sufixo}</span>}
      </div>
      {ajuda && <p className="mt-1 text-xs leading-relaxed text-gray-500">{ajuda}</p>}
    </div>
  );
}

// Janela do regime de uma obra.
function JanelaRegime({ empresaId, centro, irpjPadrao, onFechar, onSalvo }) {
  const [regime, setRegime] = useState(null);
  const [terreno, setTerreno] = useState('');
  const [unidades, setUnidades] = useState('');
  const [lotes, setLotes] = useState('');
  const [credito, setCredito] = useState('');
  const [irpj, setIrpj] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!centro) return;
    const c = centro.config;
    setRegime(c?.regime || null);
    setTerreno(paraCampo(c?.valor_terreno));
    setUnidades(c?.unidades_residenciais ?? centro.numero_unidades ?? '');
    setLotes(c?.lotes ?? '0');
    setCredito(paraCampo(c?.perc_custo_credito));
    setIrpj(paraCampo(c?.irpj_csll ?? irpjPadrao));
    setErro('');
  }, [centro, irpjPadrao]);

  async function salvar() {
    setErro('');
    if (!regime) {
      setErro('Escolha o regime da obra.');
      return;
    }
    const regular = regime === 'REGULAR';
    const dados = {
      regime,
      valor_terreno: regular ? lerNumero(terreno) : null,
      unidades_residenciais: regular ? lerNumero(unidades) ?? 0 : null,
      lotes: regular ? lerNumero(lotes) ?? 0 : null,
      perc_custo_credito: regular ? lerNumero(credito) : null,
      irpj_csll: regular ? lerNumero(irpj) : null,
    };
    if (regular && (dados.valor_terreno === null || dados.perc_custo_credito === null || dados.irpj_csll === null)) {
      setErro('Preencha o valor do terreno, a parte do custo que gera crédito e o IRPJ/CSLL (use 0 se não houver).');
      return;
    }
    setSalvando(true);
    try {
      onSalvo(await salvarCentroReforma(empresaId, centro.id, dados));
      onFechar();
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    setSalvando(true);
    try {
      onSalvo(await limparCentroReforma(empresaId, centro.id));
      onFechar();
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível remover.');
    } finally {
      setSalvando(false);
    }
  }

  if (!centro) return null;
  return (
    <Modal open title={`${centro.id} · ${centro.apelido || centro.nome}`} onClose={onFechar} maxWidthClass="max-w-3xl">
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Regime na reforma</h3>
          <div role="radiogroup" aria-label="Regime na reforma" className="mt-3 grid gap-3 sm:grid-cols-2">
            {OPCOES_REGIME.map((o) => {
              const ativo = regime === o.value;
              return (
                <label
                  key={o.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    ativo ? 'border-primary-500 bg-primary-50' : regime ? 'border-gray-200 hover:border-gray-300' : 'border-amber-300 bg-amber-50 hover:border-amber-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="regime"
                    value={o.value}
                    checked={ativo}
                    onChange={() => setRegime(o.value)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{o.titulo}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{o.texto}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {regime === 'REGULAR' && (
          <div>
            <h3 className="border-b border-gray-100 pb-2 text-sm font-semibold text-gray-900">Dados do regime regular</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Campo
                rotulo="Valor do terreno (redutor de ajuste)"
                prefixo="R$"
                valor={terreno}
                onChange={setTerreno}
                ajuda="Abate a base do IBS/CBS, distribuído pela receita da obra."
              />
              <Campo
                rotulo="Parte do custo da obra que gera crédito"
                sufixo="%"
                valor={credito}
                onChange={setCredito}
                ajuda="Materiais e serviços de empresas geram crédito; folha própria, tributos e terreno de pessoa física não."
              />
              <Campo
                rotulo="Unidades residenciais"
                valor={String(unidades)}
                onChange={setUnidades}
                ajuda={`Cada uma abate o redutor social da aba Alíquotas.${centro.numero_unidades ? ` Cadastro do centro: ${centro.numero_unidades} unidades.` : ''}`}
              />
              <Campo rotulo="Lotes residenciais" valor={String(lotes)} onChange={setLotes} ajuda="Só em loteamento (redutor social do lote)." />
              <Campo
                rotulo="IRPJ / CSLL fora do RET"
                sufixo="% da receita"
                valor={irpj}
                onChange={setIrpj}
                ajuda="Lucro Presumido na venda de imóveis: 3,08% (IRPJ com adicional + CSLL sobre 8% e 12% de presunção)."
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <Button onClick={salvar} loading={salvando}>
            Salvar
          </Button>
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          {centro.config && (
            <button type="button" onClick={remover} disabled={salvando} className="ml-auto text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-60">
              Remover configuração
            </button>
          )}
          {erro && (
            <span className="flex w-full items-center gap-1.5 text-sm text-red-600">
              <AlertTriangle size={15} className="shrink-0" /> {erro}
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Aba Centros de Custos: as obras (com "Realiza DRE" ou "Projeta DFC"), a projeção da DRE que o Impacto DRE
// usa, se estão no DFC e o regime de cada uma na reforma (vale para os dois impactos). Clicar numa linha
// abre a janela do regime.
export default function CentrosReformaTab({ empresaId }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(null);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErro('');
    listCentrosReforma(empresaId)
      .then(setDados)
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar os centros de custo.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setDados(null);
    setAberto(null);
    carregar();
  }, [carregar]);

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Building2 size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para configurar o regime de cada obra.</p>
      </div>
    );
  }

  const centros = dados?.centros || [];
  const configurados = centros.filter((c) => c.config).length;

  return (
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {carregando && !dados ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : erro ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <TriangleAlert size={26} className="text-red-400" />
          <p className="text-sm text-gray-600">{erro}</p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-gray-500">
            {configurados} de {centros.length} {centros.length === 1 ? 'obra configurada' : 'obras configuradas'}. Clique numa obra para escolher o regime.
            Obra sem regime fica como está na projeção. O regime vale para o Impacto DRE e para o Impacto DFC.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className={CABECALHO}>
                  <th className="py-2.5 pl-4 pr-3 text-left">Centro de custo</th>
                  <th className="px-3 py-2.5 text-left">Projeção da DRE</th>
                  <th className="px-3 py-2.5 text-left">No DFC</th>
                  <th className="px-3 py-2.5 text-left">Regime</th>
                  <th className="px-3 py-2.5 text-right">Terreno</th>
                  <th className="px-3 py-2.5 text-right">Unid. residenciais</th>
                  <th className="px-3 py-2.5 text-right">Custo com crédito</th>
                  <th className="px-3 py-2.5 text-right">IRPJ / CSLL</th>
                  <th className="py-2.5 pl-3 pr-4 text-left">Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {centros.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
                      Nenhuma obra com "Realiza DRE" ou "Projeta DFC" nesta empresa.
                    </td>
                  </tr>
                ) : (
                  centros.map((c) => {
                    const k = c.config;
                    const regular = k?.regime === 'REGULAR';
                    const r = REGIMES[k?.regime];
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setAberto(c)}
                        title="Escolher o regime desta obra"
                        className="cursor-pointer border-b border-gray-100 text-gray-700 hover:bg-gray-50"
                      >
                        <td className="py-3 pl-4 pr-3">
                          <span className="mr-2 tabular-nums text-gray-400">{c.id}</span>
                          <span className="font-medium text-gray-800">{c.nome}</span>
                          {c.apelido && <span className="text-gray-400"> · {c.apelido}</span>}
                        </td>
                        <td className="px-3 py-3">
                          <Projecao p={c.projecao} naDre={c.realiza_dre} />
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-600">{c.projeta_dfc ? 'Sim' : <Vazio />}</td>
                        <td className="px-3 py-3">
                          {r ? (
                            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.classe}`}>{r.rotulo}</span>
                          ) : (
                            <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Não configurado</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{regular ? moeda(k.valor_terreno) : <Vazio />}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{regular ? k.unidades_residenciais + (k.lotes ? ` + ${k.lotes} lotes` : '') : <Vazio />}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{regular ? aliquota(k.perc_custo_credito) : <Vazio />}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{regular ? aliquota(k.irpj_csll) : <Vazio />}</td>
                        <td className="py-3 pl-3 pr-4 text-xs text-gray-500">
                          {k ? `${new Date(k.atualizado_em).toLocaleDateString('pt-BR')}${k.usuario ? ` · ${k.usuario}` : ''}` : <Vazio />}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <JanelaRegime
        empresaId={empresaId}
        centro={aberto}
        irpjPadrao={dados?.irpj_csll_padrao}
        onFechar={() => setAberto(null)}
        onSalvo={setDados}
      />
    </div>
  );
}
