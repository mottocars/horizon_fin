import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Plus, Users } from 'lucide-react';
import Card from '../../../../components/Card';
import { getResumoClusters, getResumoPorCentroCustoClusters } from '../../../../api/cobrancaClusters.api';
import {
  CLUSTER_ORDEM,
  CLUSTER_LABEL,
  CLUSTER_TAG_ESTILO,
  CLUSTER_ICON,
  CLUSTER_ICON_COR,
  formatarMoeda,
} from './constantes';

// Monta a query string pro nível 2. `filtroCentroCustoIds` é o centro
// específico que a linha de cluster clicada representa (o que de fato
// filtra a listagem lá) — sempre 1 só, o do drilldown expandido.
// `voltarFiltroAnteriorIds` é o filtro de Centro de Custo que já estava
// selecionado no topo da tela ANTES de entrar no drilldown, gravado à parte
// (`voltar_cost_center_ids`) só pra "Voltar" (ver ClusterClientesList.jsx::
// voltar) restaurar exatamente esse estado — sem essa distinção, voltar
// deixava `cost_center_ids` (do centro clicado) sobrescrever o filtro
// original da tela.
function queryContexto(empresaId, filtroCentroCustoIds, voltarFiltroAnteriorIds) {
  const params = new URLSearchParams({ empresa_id: empresaId });
  if (filtroCentroCustoIds?.length > 0) params.set('cost_center_ids', filtroCentroCustoIds.join(','));
  params.set('voltar_cost_center_ids', voltarFiltroAnteriorIds?.length > 0 ? voltarFiltroAnteriorIds.join(',') : '');
  return params.toString();
}

// Matriz de drilldown ao estilo Power BI: 1 tabela só, 1 cabeçalho só —
// nível 0 (linha por Centro de Custo) e nível 1 (linha por Cluster, quando
// expandido) usam exatamente as mesmas colunas, então o cabeçalho não
// precisa repetir por nível (dá pra saber o que é cada célula só pela
// posição). O "+"/"−" no canto esquerdo da linha do Centro de Custo abre/
// fecha o detalhe por cluster logo abaixo dela; só 1 centro de custo fica
// aberto por vez (abrir outro fecha o anterior automaticamente), pra barra
// de rolagem não crescer à toa. Clicar numa linha de cluster (nível 1) leva
// pro nível 2 de sempre (ClusterClientesList), já filtrado só por aquele
// centro de custo.
export default function CentrosCustoResumo({ empresaId, centroCustoIds = [], refreshToken = 0 }) {
  const navigate = useNavigate();
  const [centros, setCentros] = useState([]);
  const [carregando, setCarregando] = useState(false);

  // Só 1 centro de custo expandido por vez — accordion exclusivo.
  const [centroExpandidoId, setCentroExpandidoId] = useState(null);
  const [detalheClusters, setDetalheClusters] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  // Guarda contra corrida (mesmo padrão usado em toda a tela de Clusters de
  // Clientes — ver ClusterClientesList.jsx) — uma pra lista de centros, outra
  // pro detalhe por cluster do centro expandido (são requisições independentes).
  const requisicaoListaRef = useRef(0);
  const requisicaoDetalheRef = useRef(0);

  const carregar = useCallback(() => {
    if (!empresaId) {
      setCentros([]);
      return;
    }
    const minhaRequisicao = ++requisicaoListaRef.current;
    setCarregando(true);
    getResumoPorCentroCustoClusters(empresaId, { costCenterIds: centroCustoIds })
      .then((dados) => {
        if (minhaRequisicao === requisicaoListaRef.current) setCentros(dados);
      })
      .finally(() => {
        if (minhaRequisicao === requisicaoListaRef.current) setCarregando(false);
      });
  }, [empresaId, centroCustoIds]);

  useEffect(() => {
    // A lista pode mudar de conteúdo (empresa/filtro diferente) — fecha
    // qualquer detalhe aberto, senão sobra um centro expandido que nem
    // aparece mais na lista nova.
    setCentroExpandidoId(null);
    setDetalheClusters(null);
    carregar();
  }, [carregar, refreshToken]);

  // Busca o detalhe por cluster (mesmo endpoint/formato do antigo nível 1)
  // só do centro de custo que acabou de expandir — nada é buscado antes de
  // abrir.
  useEffect(() => {
    if (!centroExpandidoId) return;
    const minhaRequisicao = ++requisicaoDetalheRef.current;
    setCarregandoDetalhe(true);
    getResumoClusters(empresaId, { costCenterIds: [centroExpandidoId] })
      .then((dados) => {
        if (minhaRequisicao === requisicaoDetalheRef.current) setDetalheClusters(dados);
      })
      .finally(() => {
        if (minhaRequisicao === requisicaoDetalheRef.current) setCarregandoDetalhe(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centroExpandidoId, empresaId, refreshToken]);

  function toggleExpandido(id) {
    setCentroExpandidoId((atual) => {
      if (atual === id) {
        setDetalheClusters(null);
        return null;
      }
      setDetalheClusters(null);
      return id;
    });
  }

  if (!empresaId) {
    return (
      <Card className="flex min-h-[280px] rounded-tl-none flex-col items-center justify-center text-center">
        <Users size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver os clusters de clientes calculados pelo Motor de Risco.
        </p>
      </Card>
    );
  }

  const semDados = !carregando && centros.length === 0;
  const totalColunas = 4 + CLUSTER_ORDEM.length;

  return (
    <div className="space-y-4">
      <Card className="rounded-tl-none">
        {carregando ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : semDados ? (
          <div className="flex min-h-[120px] flex-col items-center justify-center text-center">
            <p className="text-sm text-gray-500">
              Nenhum centro de custo encontrado{centroCustoIds.length > 0 ? ' com o filtro escolhido' : ''}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-3 pl-3 font-medium">Centro de Custo</th>
                  <th className="py-3 text-center font-medium">Saldo vencido</th>
                  <th className="py-3 text-center font-medium">Saldo no mês</th>
                  <th className="py-3 text-center font-medium">Clientes</th>
                  {CLUSTER_ORDEM.map((cluster) => {
                    const Icone = CLUSTER_ICON[cluster];
                    return (
                      <th key={cluster} className="py-3 text-center font-medium" title={CLUSTER_LABEL[cluster]}>
                        {Icone && <Icone size={15} className={`inline ${CLUSTER_ICON_COR[cluster]}`} />}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {centros.map((centro) => {
                  const expandido = centroExpandidoId === centro.cost_center_id;
                  return (
                    <Fragment key={centro.cost_center_id}>
                      <tr
                        onClick={() => toggleExpandido(centro.cost_center_id)}
                        className={`cursor-pointer border-b border-gray-50 hover:bg-gray-100 ${expandido ? 'bg-gray-100 font-semibold' : ''}`}
                      >
                        <td className="py-3 pl-3 text-gray-900">
                          <span className="flex items-center gap-2">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                              {expandido ? <Minus size={10} /> : <Plus size={10} />}
                            </span>
                            {centro.cost_center_name}
                          </span>
                        </td>
                        <td className="py-3 text-center tabular-nums text-red-600">{formatarMoeda(centro.saldo_vencido)}</td>
                        <td className="py-3 text-center tabular-nums text-gray-600">{formatarMoeda(centro.saldo_no_mes)}</td>
                        <td className="py-3 text-center tabular-nums text-gray-900">
                          {centro.total_clientes.toLocaleString('pt-BR')}
                        </td>
                        {CLUSTER_ORDEM.map((cluster) => (
                          <td key={cluster} className="py-3 text-center font-mono tabular-nums text-gray-900">
                            {centro.clusters[cluster]}
                          </td>
                        ))}
                      </tr>

                      {expandido && carregandoDetalhe && (
                        <tr>
                          <td colSpan={totalColunas} className="bg-gray-100 py-6 text-center text-sm text-gray-400">
                            Carregando...
                          </td>
                        </tr>
                      )}

                      {expandido &&
                        !carregandoDetalhe &&
                        detalheClusters &&
                        CLUSTER_ORDEM.map((cluster) => {
                          const dados = detalheClusters.clusters[cluster] || {
                            total_clientes: 0,
                            saldo_vencido: 0,
                            saldo_no_mes: 0,
                          };
                          const Icone = CLUSTER_ICON[cluster];
                          return (
                            <tr
                              key={cluster}
                              onClick={() =>
                                navigate(
                                  `/operacoes/gestao-de-cobrancas/clusters/${cluster}?${queryContexto(empresaId, [centro.cost_center_id], centroCustoIds)}`
                                )
                              }
                              className="cursor-pointer border-b border-gray-50 bg-gray-100 hover:bg-gray-200"
                            >
                              <td className="py-2.5 pl-9">
                                <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${CLUSTER_TAG_ESTILO[cluster]}`}>
                                  {Icone && <Icone size={13} className={CLUSTER_ICON_COR[cluster]} />}
                                  {CLUSTER_LABEL[cluster]}
                                </span>
                              </td>
                              <td className="py-2.5 text-center tabular-nums text-red-600">{formatarMoeda(dados.saldo_vencido)}</td>
                              <td className="py-2.5 text-center tabular-nums text-gray-600">{formatarMoeda(dados.saldo_no_mes)}</td>
                              <td className="py-2.5 text-center tabular-nums text-gray-900">
                                {dados.total_clientes.toLocaleString('pt-BR')}
                              </td>
                              <td colSpan={CLUSTER_ORDEM.length}></td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
