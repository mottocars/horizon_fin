import { Fragment, useCallback, useEffect, useState } from 'react';
import { Activity, Check, HardHat, Loader2, Minus, Pencil, Plus, TriangleAlert } from 'lucide-react';
import { listAvancosDfc, salvarAvancoManualDfc } from '../../../api/dfcAvancos.api';
import iconCaixa from '../../../assets/integracoes/portal-construtoras.svg';
import iconPrevision from '../../../assets/integracoes/prevision.svg';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function rotuloMes(anoMes) {
  const [ano, mes] = anoMes.split('-');
  return `${MESES[Number(mes) - 1]}/${ano.slice(2)}`;
}

function mesAnterior(anoMes) {
  let [ano, mes] = anoMes.split('-').map(Number);
  mes -= 1;
  if (mes === 0) {
    mes = 12;
    ano -= 1;
  }
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function vazio(v) {
  return v === null || v === undefined;
}

function pct(valor, comSinal = false) {
  if (vazio(valor)) return '—';
  const texto = Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!comSinal) return `${valor < 0 ? '-' : ''}${texto}%`;
  return `${valor > 0 ? '+' : valor < 0 ? '-' : ''}${texto}%`;
}

// "12,5" / "12.5" / "12,5%" -> 12.5 ; '' -> null ; texto inválido -> NaN.
function interpretarPct(texto) {
  const t = String(texto ?? '').replace(/\s|%/g, '').replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  return Math.round(parseFloat(t) * 100) / 100;
}

const LARGURA_PRIMEIRA = 300;
const LARGURA_MES = 88;

// Os 4 cenários (pedido do usuário), decididos pelos dados que existem pra obra:
// - Caixa + Prevision: linhas PLS, Prevision e Desvio; a obra mostra Caixa até o mês anterior ao
//   atual e Prevision do mês atual em diante.
// - Só Caixa: linhas PLS e Manual (editável do mês atual em diante); a obra mostra Caixa até o mês
//   anterior e o Manual do mês atual em diante.
// - Só Prevision: linha Prevision; a obra mostra tudo Prevision.
// - Nenhum: linha Manual (editável em todos os meses); a obra mostra tudo Manual.
// "Ter Caixa" = DCD com parcela liberada; "ter Prevision" = projeto sincronizado do Prevision.
function cenario(obra) {
  const caixa = Boolean(obra.pls);
  const prevision = Boolean(obra.prevision);
  if (caixa && prevision) return 'CAIXA_PREVISION';
  if (caixa) return 'CAIXA';
  if (prevision) return 'PREVISION';
  return 'MANUAL';
}

// Valor e origem da linha da obra (nível 1) num mês.
function consolidado(obra, cen, mes, mesAtual) {
  const manual = obra.manual?.[mes];
  if (cen === 'CAIXA_PREVISION') {
    return mes < mesAtual ? { valor: obra.pls[mes], fonte: 'Caixa (DCD)' } : { valor: obra.prevision[mes], fonte: 'Prevision' };
  }
  if (cen === 'CAIXA') {
    return mes < mesAtual ? { valor: obra.pls[mes], fonte: 'Caixa (DCD)' } : { valor: manual, fonte: 'Manual' };
  }
  if (cen === 'PREVISION') return { valor: obra.prevision[mes], fonte: 'Prevision' };
  return { valor: manual, fonte: 'Manual' };
}

function legendaObra(cen, mesAtual) {
  const ate = rotuloMes(mesAnterior(mesAtual));
  const de = rotuloMes(mesAtual);
  if (cen === 'CAIXA_PREVISION') return `Caixa até ${ate} · Prevision a partir de ${de}`;
  if (cen === 'CAIXA') return `Caixa até ${ate} · Manual a partir de ${de}`;
  if (cen === 'PREVISION') return 'Prevision';
  return 'Manual';
}

// Célula do avanço manual: fora de edição mostra "12,50%"; ao focar vira o número puro; grava ao
// sair (Enter também). Vazio apaga. Texto inválido descarta a edição. Mesmo par de cores das
// outras abas: âmbar sem valor, azul claro com valor.
function CelulaManual({ valor, onCommit }) {
  const [texto, setTexto] = useState(null);
  const editando = texto !== null;

  function commit() {
    if (texto === null) return;
    const novo = interpretarPct(texto);
    setTexto(null);
    if (Number.isNaN(novo) || (novo !== null && novo > 100)) return;
    if (novo === (vazio(valor) ? null : valor)) return;
    onCommit(novo);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={editando ? texto : vazio(valor) ? '' : pct(valor)}
      placeholder="—"
      onFocus={(e) => {
        setTexto(vazio(valor) ? '' : String(valor).replace('.', ','));
        const campo = e.currentTarget;
        setTimeout(() => campo.select(), 0);
      }}
      onChange={(e) => {
        if (/^[\d.,\s%]*$/.test(e.target.value)) setTexto(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          setTexto(null);
          e.currentTarget.blur();
        }
      }}
      className={`h-7 w-full rounded-md border px-1.5 text-right text-xs tabular-nums text-gray-900 outline-none transition-colors placeholder:text-gray-300 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-100 ${
        vazio(valor) ? 'border-amber-200 bg-amber-50' : 'border-primary-100 bg-primary-50'
      }`}
    />
  );
}

// Operações > DFC Construtoras > Avanços Obras: matriz mês a mês (colunas = meses do período do
// topo) com o avanço ACUMULADO de cada obra, em drilldown: nível 1 = a obra (o avanço consolidado,
// conforme o cenário — ver `cenario`), nível 2 = as fontes (PLS da Caixa, Prevision, Manual) e o
// Desvio. PLS e Prevision: mesma conta da antiga Curva de Obras — ver backend
// dfc-avancos/dfcAvancos.service.js. As obras começam sempre fechadas (pedido do usuário); o manual
// salva na hora.
export default function DfcAvancosTab({ empresaId, inicio, fim }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [abertos, setAbertos] = useState([]);
  const [pendentes, setPendentes] = useState(0);
  const [erroSalvar, setErroSalvar] = useState('');
  const [salvoAlgumaVez, setSalvoAlgumaVez] = useState(false);

  const periodoValido = Boolean(inicio && fim && fim >= inicio);

  const carregar = useCallback(() => {
    if (!empresaId || !periodoValido) return;
    setCarregando(true);
    setErroCarga('');
    listAvancosDfc(empresaId, { inicio, fim })
      .then(setDados)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar os avanços.'))
      .finally(() => setCarregando(false));
  }, [empresaId, inicio, fim, periodoValido]);

  useEffect(() => {
    setDados(null);
    setAbertos([]);
    setErroSalvar('');
    setSalvoAlgumaVez(false);
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function alternar(id) {
    setAbertos((atual) => (atual.includes(id) ? atual.filter((v) => v !== id) : [...atual, id]));
  }

  function trocarManual(siengeId, mes, percentual) {
    setDados((atual) => ({
      ...atual,
      obras: atual.obras.map((o) => {
        if (o.sienge_id !== siengeId) return o;
        const manual = { ...o.manual };
        if (percentual === null) delete manual[mes];
        else manual[mes] = percentual;
        return { ...o, manual };
      }),
    }));
  }

  // Atualiza na hora e grava; se falhar, volta o que estava.
  async function salvarManual(obra, mes, percentual) {
    const anterior = obra.manual?.[mes] ?? null;
    trocarManual(obra.sienge_id, mes, percentual);
    setErroSalvar('');
    setPendentes((n) => n + 1);
    try {
      await salvarAvancoManualDfc(empresaId, obra.sienge_id, { mes, percentual });
      setSalvoAlgumaVez(true);
    } catch (err) {
      trocarManual(obra.sienge_id, mes, anterior);
      setErroSalvar(err.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setPendentes((n) => n - 1);
    }
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <HardHat size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver o avanço das obras.</p>
      </div>
    );
  }

  const meses = dados?.meses || [];
  const obras = dados?.obras || [];
  const mesAtual = dados?.mes_atual || '';
  const statusSalvamento = pendentes > 0 ? 'salvando' : erroSalvar ? 'erro' : salvoAlgumaVez ? 'salvo' : null;

  return (
    // min-w-fit: com tabela mais larga que a tela, o quadro branco cresce junto (e a página rola na
    // horizontal) em vez de a tabela vazar pra fora dele.
    <div className="min-w-fit rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {statusSalvamento && (
        <div className="-mt-1 mb-3 flex items-center justify-end text-xs" aria-live="polite">
          {statusSalvamento === 'salvando' ? (
            <span className="flex items-center gap-1.5 text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Salvando...
            </span>
          ) : statusSalvamento === 'erro' ? (
            <span className="flex items-center gap-1.5 text-red-600" title={erroSalvar}>
              <TriangleAlert size={14} /> Erro ao salvar
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-600">
              <Check size={14} /> Alterações salvas
            </span>
          )}
        </div>
      )}

      {erroSalvar && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" role="status">
          {erroSalvar}
        </div>
      )}

      {!periodoValido ? (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <TriangleAlert size={15} className="shrink-0" />A Data fim precisa ser igual ou depois da Data início.
        </div>
      ) : carregando && !dados ? (
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
            style={{ tableLayout: 'fixed', width: '100%', minWidth: LARGURA_PRIMEIRA + meses.length * LARGURA_MES }}
          >
            <colgroup>
              <col style={{ width: LARGURA_PRIMEIRA }} />
              {meses.map((m) => (
                <col key={m} />
              ))}
            </colgroup>
            <thead>
              <tr className="[&>th:first-child]:rounded-tl-lg [&>th:last-child]:rounded-tr-lg">
                <th className="sticky -top-6 left-0 z-30 border-b-2 border-r border-b-blue-500 border-r-blue-100 bg-blue-50 py-2.5 pl-4 pr-3 text-xs font-medium uppercase tracking-wide text-blue-700">
                  Centro de custo / Avanço acumulado
                </th>
                {meses.map((m) => (
                  <th
                    key={m}
                    className={`sticky -top-6 z-20 border-b-2 border-l border-b-blue-500 border-l-blue-100 px-2 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-blue-700 ${
                      m === mesAtual ? 'bg-blue-100' : 'bg-blue-50'
                    }`}
                    title={m === mesAtual ? 'Mês atual' : undefined}
                  >
                    {rotuloMes(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {obras.length === 0 && (
                <tr>
                  <td colSpan={meses.length + 1} className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
                    Nenhuma obra com &quot;Projeta DFC&quot; marcado. Marque na aba Centros Custos.
                  </td>
                </tr>
              )}
              {obras.map((obra) => {
                const aberto = abertos.includes(obra.sienge_id);
                const cen = cenario(obra);
                const linhas = [];
                if (cen === 'CAIXA_PREVISION' || cen === 'CAIXA') {
                  linhas.push({
                    chave: 'pls',
                    icone: <img src={iconCaixa} alt="" className="h-3.5 w-3.5 shrink-0" />,
                    rotulo: 'Avanço PLS',
                    valor: (m) => obra.pls[m],
                    titulo: obra.ultimo_mes_liberado
                      ? `Realizado até ${rotuloMes(obra.ultimo_mes_liberado)} (último mês liberado no DCD)`
                      : '',
                  });
                }
                if (cen === 'CAIXA_PREVISION' || cen === 'PREVISION') {
                  linhas.push({
                    chave: 'prevision',
                    icone: <img src={iconPrevision} alt="" className="h-3.5 w-3.5 shrink-0" />,
                    rotulo: 'Avanço Prevision',
                    valor: (m) => obra.prevision[m],
                  });
                }
                if (cen === 'CAIXA_PREVISION') {
                  linhas.push({
                    chave: 'desvio',
                    icone: <Activity size={14} className="shrink-0 text-gray-400" />,
                    rotulo: 'Desvio',
                    titulo: 'Avanço PLS − Avanço Prevision',
                    valor: (m) => {
                      const a = obra.pls[m];
                      const b = obra.prevision[m];
                      return vazio(a) || vazio(b) ? null : Math.round((a - b) * 100) / 100;
                    },
                  });
                }
                if (cen === 'CAIXA' || cen === 'MANUAL') {
                  linhas.push({
                    chave: 'manual',
                    icone: <Pencil size={13} className="shrink-0 text-gray-400" />,
                    rotulo: 'Avanço Manual',
                    aviso: cen === 'MANUAL' ? 'sem Caixa e sem Prevision' : `a partir de ${rotuloMes(mesAtual)}`,
                    manual: true,
                    // Só Caixa: o manual vale do mês atual em diante (antes é o realizado da Caixa).
                    editavel: (m) => cen === 'MANUAL' || m >= mesAtual,
                  });
                }

                return (
                  <Fragment key={obra.sienge_id}>
                    {/* Nível 1: a obra, com o avanço consolidado conforme o cenário */}
                    <tr onClick={() => alternar(obra.sienge_id)} className="group/obra cursor-pointer">
                      <td className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-50 py-2 pl-3 pr-2 group-hover/obra:bg-gray-100">
                        <span className="flex items-center gap-2">
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                            {aberto ? <Minus size={10} /> : <Plus size={10} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-gray-900" title={obra.name}>
                              {obra.name}
                            </span>
                            <span className="block truncate text-[10px] text-gray-400">{legendaObra(cen, mesAtual)}</span>
                          </span>
                        </span>
                      </td>
                      {meses.map((m) => {
                        const { valor, fonte } = consolidado(obra, cen, m, mesAtual);
                        return (
                          <td
                            key={m}
                            title={vazio(valor) ? undefined : fonte}
                            className={`border-b border-l border-gray-200 px-2 text-right text-xs font-semibold tabular-nums group-hover/obra:bg-gray-100 ${
                              m === mesAtual ? 'bg-gray-100' : 'bg-gray-50'
                            } ${vazio(valor) ? 'text-gray-300' : 'text-gray-900'}`}
                          >
                            {pct(valor)}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Nível 2: as fontes (e o Desvio) */}
                    {aberto &&
                      linhas.map((l) => (
                        <tr key={l.chave}>
                          <td
                            className="sticky left-0 z-10 border-b border-r border-gray-100 border-r-gray-200 bg-white py-1.5 pl-9 pr-3"
                            title={l.titulo || undefined}
                          >
                            <span className="flex items-center gap-2">
                              {l.icone}
                              <span className="truncate text-xs font-medium text-gray-800">{l.rotulo}</span>
                              {l.aviso && <span className="shrink-0 text-[10px] text-gray-400">({l.aviso})</span>}
                            </span>
                          </td>
                          {meses.map((m) => {
                            if (l.manual) {
                              return (
                                <td key={m} className="border-b border-l border-gray-100 bg-white p-1">
                                  {l.editavel(m) ? (
                                    <CelulaManual
                                      valor={obra.manual?.[m]}
                                      onCommit={(novo) => salvarManual(obra, m, novo)}
                                    />
                                  ) : (
                                    <span className="block px-1.5 text-right text-xs text-gray-300">—</span>
                                  )}
                                </td>
                              );
                            }
                            const v = l.valor(m);
                            const cor =
                              l.chave === 'desvio' && !vazio(v)
                                ? v > 0
                                  ? 'text-emerald-600'
                                  : v < 0
                                    ? 'text-red-600'
                                    : 'text-gray-600'
                                : vazio(v)
                                  ? 'text-gray-300'
                                  : 'text-gray-800';
                            return (
                              <td
                                key={m}
                                className={`border-b border-l border-gray-100 bg-white px-2 py-1.5 text-right tabular-nums ${cor} ${
                                  l.chave === 'desvio' ? 'font-semibold' : ''
                                }`}
                              >
                                {pct(v, l.chave === 'desvio')}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
