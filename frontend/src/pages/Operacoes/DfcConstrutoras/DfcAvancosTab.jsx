import { Fragment, useCallback, useEffect, useState } from 'react';
import { Activity, HardHat, Minus, Plus, TriangleAlert } from 'lucide-react';
import { listAvancosDfc } from '../../../api/dfcAvancos.api';
import iconCaixa from '../../../assets/integracoes/portal-construtoras.svg';
import iconPrevision from '../../../assets/integracoes/prevision.svg';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function rotuloMes(anoMes) {
  const [ano, mes] = anoMes.split('-');
  return `${MESES[Number(mes) - 1]}/${ano.slice(2)}`;
}

function pct(valor, comSinal = false) {
  if (valor === null || valor === undefined) return '—';
  const texto = Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!comSinal) return `${valor < 0 ? '-' : ''}${texto}%`;
  return `${valor > 0 ? '+' : valor < 0 ? '-' : ''}${texto}%`;
}

const LARGURA_PRIMEIRA = 300;
const LARGURA_MES = 88;

// Operações > DFC Construtoras > Avanços Obras: matriz mês a mês (colunas = meses do período do
// topo) com o avanço ACUMULADO de cada obra, em drilldown: nível 1 = centro de custo, nível 2 =
// Avanço PLS (Caixa — DCD), Avanço Prevision e Desvio (PLS − Prevision). Mesma conta da antiga
// tela Curva de Obras — ver backend dfc-avancos/dfcAvancos.service.js. O PLS é o realizado: conta
// até o último mês com parcela liberada no DCD (e fica parado nele depois); mês futuro não tem
// realizado. Tudo começa aberto.
export default function DfcAvancosTab({ empresaId, inicio, fim }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [fechados, setFechados] = useState([]);

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
    setFechados([]);
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function alternar(id) {
    setFechados((atual) => (atual.includes(id) ? atual.filter((v) => v !== id) : [...atual, id]));
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

  return (
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
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
        // Rola na horizontal quando o período tem muitos meses; a 1ª coluna fica presa à esquerda.
        <div className="overflow-x-auto rounded-t-lg">
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
              <tr>
                <th className="sticky left-0 z-10 border-b-2 border-r border-b-blue-500 border-r-blue-100 bg-blue-50 py-2.5 pl-4 pr-3 text-xs font-medium uppercase tracking-wide text-blue-700">
                  Centro de custo / Avanço acumulado
                </th>
                {meses.map((m) => (
                  <th
                    key={m}
                    className="border-b-2 border-l border-b-blue-500 border-l-blue-100 bg-blue-50 px-2 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-blue-700"
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
                const aberto = !fechados.includes(obra.sienge_id);
                const desvio = Object.fromEntries(
                  meses.map((m) => {
                    const a = obra.pls?.[m];
                    const b = obra.prevision?.[m];
                    return [m, a === null || a === undefined || b === null || b === undefined ? null : Math.round((a - b) * 100) / 100];
                  })
                );
                const linhas = [
                  {
                    chave: 'pls',
                    icone: <img src={iconCaixa} alt="" className="h-3.5 w-3.5 shrink-0" />,
                    rotulo: 'Avanço PLS',
                    aviso: !obra.contrato ? 'sem Contrato Caixa' : !obra.pls ? 'sem DCD liberado' : '',
                    valores: obra.pls,
                    titulo: obra.ultimo_mes_liberado ? `Realizado até ${rotuloMes(obra.ultimo_mes_liberado)} (último mês liberado no DCD)` : '',
                  },
                  {
                    chave: 'prevision',
                    icone: <img src={iconPrevision} alt="" className="h-3.5 w-3.5 shrink-0" />,
                    rotulo: 'Avanço Prevision',
                    aviso: !obra.codigo_prevision ? 'sem código Prevision' : !obra.prevision ? 'sem dados do Prevision' : '',
                    valores: obra.prevision,
                    titulo: '',
                  },
                  {
                    chave: 'desvio',
                    icone: <Activity size={14} className="shrink-0 text-gray-400" />,
                    rotulo: 'Desvio',
                    aviso: '',
                    valores: obra.pls && obra.prevision ? desvio : null,
                    titulo: 'Avanço PLS − Avanço Prevision',
                  },
                ];
                return (
                  <Fragment key={obra.sienge_id}>
                    {/* Nível 1: centro de custo */}
                    <tr onClick={() => alternar(obra.sienge_id)} className="group/obra cursor-pointer">
                      <td className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-50 py-2.5 pl-3 pr-2 group-hover/obra:bg-gray-100">
                        <span className="flex items-center gap-2">
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                            {aberto ? <Minus size={10} /> : <Plus size={10} />}
                          </span>
                          <span className="truncate text-xs font-semibold text-gray-900" title={obra.name}>
                            {obra.name}
                          </span>
                        </span>
                      </td>
                      {meses.map((m) => (
                        <td key={m} className="border-b border-l border-gray-200 bg-gray-50 group-hover/obra:bg-gray-100" />
                      ))}
                    </tr>

                    {/* Nível 2: PLS, Prevision e Desvio */}
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
                            const v = l.valores ? l.valores[m] : null;
                            const cor =
                              l.chave === 'desvio' && v !== null && v !== undefined
                                ? v > 0
                                  ? 'text-emerald-600'
                                  : v < 0
                                    ? 'text-red-600'
                                    : 'text-gray-600'
                                : v === null || v === undefined
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
