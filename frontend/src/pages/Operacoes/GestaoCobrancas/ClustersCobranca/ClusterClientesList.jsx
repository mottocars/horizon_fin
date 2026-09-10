import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Search, ShieldAlert } from 'lucide-react';
import Card from '../../../../components/Card';
import Pagination from '../../../../components/Pagination';
import { listClientesPorCluster } from '../../../../api/cobrancaClusters.api';
import { fmt } from '../MotorRisco/calculo';
import { INDICADORES } from '../MotorRisco/conteudo';
import { CLUSTER_LABEL, CLUSTER_TAG_ESTILO, CLUSTER_ICON, CLUSTER_ICON_COR } from './constantes';

const LIMIT = 50;

// Tipo de grandeza de cada indicador (mostrado pequeno no cabeçalho, junto
// do peso) — pra deixar claro o que o número bruto por trás do "pontos"
// representa, mesmo a coluna só exibindo a pontuação.
const TIPO_INDICADOR = {
  pct_em_dia: 'Percentual',
  atraso_medio: 'Dias',
  maior_atraso: 'Dias',
  reincidencia: 'Quantidade',
  relacionamento: 'Meses',
};

// Nível 2: clientes classificados em 1 cluster, com busca por nome — só o
// rastreio do score (pontos de cada indicador + Score total). Sem colunas
// de saldo (isso fica no detalhe do cliente, ver ClienteClusterDetalhe.jsx),
// mas a linha inteira fica levemente vermelha quando o cliente tem saldo
// vencido (ver legenda). Em Mau pagador aparecem todos (score baixo e regra
// dura juntos) — o selo "Regra dura" ao lado do nome identifica quem caiu
// aí pela régua de dias vencidos, não pelo score.
export default function ClusterClientesList() {
  const { cluster } = useParams();
  const [searchParams] = useSearchParams();
  const empresaId = searchParams.get('empresa_id');
  // Filtro de Centro de Custo escolhido no nível 1 — chega aqui pela
  // querystring (ver CentrosCustoResumo.jsx::queryContexto) e segue sendo
  // aplicado neste nível 2, senão a contagem daqui destoaria do card que o
  // usuário clicou.
  const costCenterIds = (searchParams.get('cost_center_ids') || '').split(',').filter(Boolean).map(Number);
  // Preserva tudo (empresa + filtro + voltar_cost_center_ids) ao entrar no
  // detalhe do cliente — a própria querystring atual já carrega o contexto
  // certo. "Voltar" (função abaixo) NÃO usa isso direto — ver comentário lá.
  const querystringAtual = searchParams.toString();
  const navigate = useNavigate();
  const IconeCluster = CLUSTER_ICON[cluster];

  const [resultado, setResultado] = useState({ data: [], pagination: { page: 1, totalPages: 1, total: 0 } });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  // Guarda contra corrida (busca digitada rápido, filtro trocado, página
  // virada) — só a resposta da última chamada em voo é aplicada.
  const requisicaoAtualRef = useRef(0);

  const carregar = useCallback(
    async (termo, pagina) => {
      if (!empresaId) return;
      const minhaRequisicao = ++requisicaoAtualRef.current;
      setLoading(true);
      setErro('');
      try {
        const result = await listClientesPorCluster(empresaId, cluster, {
          search: termo,
          page: pagina,
          limit: LIMIT,
          costCenterIds,
        });
        if (minhaRequisicao === requisicaoAtualRef.current) setResultado(result);
      } catch (err) {
        if (minhaRequisicao === requisicaoAtualRef.current) {
          setErro(err.response?.data?.message || 'Não foi possível carregar os clientes deste cluster.');
        }
      } finally {
        if (minhaRequisicao === requisicaoAtualRef.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [empresaId, cluster, querystringAtual]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      carregar(search, 1);
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, carregar]);

  useEffect(() => {
    if (page !== 1) carregar(search, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Não usa `querystringAtual` puro: `cost_center_ids` aqui é o centro
  // específico do drilldown que o usuário clicou (o que filtra ESTA lista),
  // não o filtro que estava selecionado no topo da tela antes de entrar
  // aqui — repassar `cost_center_ids` direto faria "Voltar" sobrescrever o
  // filtro original pelo centro único do drilldown. `voltar_cost_center_ids`
  // (gravado por CentrosCustoResumo.jsx::queryContexto) é esse filtro
  // original, restaurado aqui.
  function voltar() {
    // `aba` precisa vir explícito aqui — a aba padrão da tela é 'rotinas'
    // (ver GestaoCobrancasPage.jsx), então sem isso "Voltar" de um drilldown
    // de cluster pousaria em Rotinas em vez de voltar pra Clusters de Clientes.
    const params = new URLSearchParams({ empresa_id: empresaId, aba: 'clusters' });
    const filtroAnterior = searchParams.has('voltar_cost_center_ids')
      ? searchParams.get('voltar_cost_center_ids')
      : searchParams.get('cost_center_ids');
    if (filtroAnterior) params.set('cost_center_ids', filtroAnterior);
    navigate(`/operacoes/gestao-de-cobrancas?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={voltar}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para Clusters de Clientes
      </button>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${CLUSTER_TAG_ESTILO[cluster]}`}>
              {IconeCluster && <IconeCluster size={14} className={CLUSTER_ICON_COR[cluster]} />}
              {CLUSTER_LABEL[cluster] || cluster}
            </span>
            <p className="mt-1.5 text-xs text-gray-500">{resultado.pagination.total} cliente(s) neste cluster</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 shrink-0 rounded-sm border border-red-200 bg-red-50" />
                Linha com saldo vencido
              </span>
              {cluster === 'mau' && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                    <ShieldAlert size={10} />
                    Regra dura
                  </span>
                  classificado pela régua de dias vencidos, não pelo score
                </span>
              )}
            </div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome do cliente..."
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
        </div>

        {erro && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <AlertTriangle size={15} className="shrink-0" />
            {erro}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : resultado.data.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">Nenhum cliente encontrado.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="py-3 font-medium">Cliente</th>
                    {INDICADORES.map((ind) => (
                      <th key={ind.id} className="py-3 text-center font-medium" title={ind.nome}>
                        <div>{ind.curto}</div>
                        <div className="font-normal normal-case text-gray-400">
                          {TIPO_INDICADOR[ind.id]} · <span className="font-semibold text-indigo-600">peso {ind.peso}%</span>
                        </div>
                      </th>
                    ))}
                    <th className="py-3 text-center font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.data.map((item) => {
                    const indicadoresPorId = Object.fromEntries((item.indicadores || []).map((ind) => [ind.indicador, ind]));
                    return (
                      <tr
                        key={item.client_id}
                        onClick={() => navigate(`/operacoes/gestao-de-cobrancas/clusters/${cluster}/${item.client_id}?${querystringAtual}`)}
                        className={`cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50 ${item.saldo_vencido > 0 ? 'bg-red-50/60' : ''}`}
                      >
                        <td className="py-3 text-gray-900">
                          <div className="flex items-center gap-2">
                            {item.client_name || `Cliente ${item.client_id}`}
                            {item.regra_dura_ativa && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                                <ShieldAlert size={10} />
                                Regra dura
                              </span>
                            )}
                          </div>
                        </td>
                        {INDICADORES.map((ind) => {
                          const dado = indicadoresPorId[ind.id];
                          return (
                            <td key={ind.id} className="py-3 text-center font-mono tabular-nums text-gray-900">
                              {dado ? fmt(dado.pontos) : <span className="text-gray-300">—</span>}
                            </td>
                          );
                        })}
                        <td className="py-3 text-center font-mono font-medium tabular-nums text-primary-600">
                          {item.score != null ? fmt(Number(item.score)) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={resultado.pagination.page} totalPages={resultado.pagination.totalPages} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
