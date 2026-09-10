import http from './http';

// `filtros` (opcional): { costCenterIds: number[] } — o mesmo filtro de
// Centro de Custo (reaproveitando a lista "com etapa Lançamento" dos
// Repasses CEF, ver frontend/src/api/repassesCef.api.js) que fica ao lado
// do filtro de Empresa na tela.
function paramsFiltros({ costCenterIds } = {}) {
  const params = {};
  if (costCenterIds?.length > 0) params.cost_center_ids = costCenterIds.join(',');
  return params;
}

export function getResumoClusters(empresaId, filtros) {
  return http
    .get('/cobranca-clusters/resumo', { params: { empresa_id: empresaId, ...paramsFiltros(filtros) } })
    .then((res) => res.data);
}

// Nível 0 (drilldown por Centro de Custo, ver ClustersCobranca/CentrosCustoResumo.jsx):
// 1 item por centro de custo com a etapa Lançamento, só com a contagem de
// clientes por cluster (sem saldo).
export function getResumoPorCentroCustoClusters(empresaId, filtros) {
  return http
    .get('/cobranca-clusters/resumo-centros-custo', { params: { empresa_id: empresaId, ...paramsFiltros(filtros) } })
    .then((res) => res.data);
}

export function recalcularClusters(empresaId) {
  return http.post('/cobranca-clusters/recalcular', { empresa_id: empresaId }).then((res) => res.data);
}

export function listClientesPorCluster(empresaId, cluster, { search, page, limit, ...filtros } = {}) {
  return http
    .get(`/cobranca-clusters/${cluster}`, {
      params: { empresa_id: empresaId, search, page, limit, ...paramsFiltros(filtros) },
    })
    .then((res) => res.data);
}

export function getClienteClusterDetalhe(empresaId, clientId) {
  return http
    .get(`/cobranca-clusters/cliente/${clientId}`, { params: { empresa_id: empresaId } })
    .then((res) => res.data);
}
