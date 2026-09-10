import http from './http';

export function getResumoCustomersSienge(empresaId) {
  return http.get('/customers-sienge/resumo', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function sincronizarCustomersSienge(empresaId) {
  return http.post('/customers-sienge/sincronizar', { empresa_id: empresaId }).then((res) => res.data);
}

// Drilldown da aba Clientes: nível 1 (por Centro de Custo, só clientes com
// conta em aberto) e nível 2 (lista de clientes daquele centro, paginada) —
// ver customers.service.js::getResumoPorCentroCusto/listClientesPorCentroCusto.
export function getResumoCentroCustoCustomers(empresaId, { costCenterIds = [], search = '' } = {}) {
  const params = { empresa_id: empresaId };
  if (costCenterIds.length > 0) params.cost_center_ids = costCenterIds.join(',');
  if (search) params.search = search;
  return http.get('/customers-sienge/resumo-centro-custo', { params }).then((res) => res.data);
}

export function listClientesPorCentroCusto(empresaId, costCenterId, { search = '', page = 1, limit = 20 } = {}) {
  return http
    .get('/customers-sienge/clientes-por-centro-custo', {
      params: { empresa_id: empresaId, cost_center_id: costCenterId, search, page, limit },
    })
    .then((res) => res.data);
}

// Excel de tudo que está na matriz Centro de Custo → Cliente da aba
// Clientes, respeitando os mesmos filtros (centro de custo/busca) ativos
// na tela — `responseType: 'blob'` pra baixar o arquivo binário direto
// (ver customers.controller.js::exportExcel).
export function exportarClientesCustomersSienge(empresaId, { costCenterIds = [], search = '' } = {}) {
  const params = { empresa_id: empresaId };
  if (costCenterIds.length > 0) params.cost_center_ids = costCenterIds.join(',');
  if (search) params.search = search;
  return http.get('/customers-sienge/exportar', { params, responseType: 'blob' }).then((res) => res.data);
}

// Flag "Comunicar" — 1 cliente só (checkbox da linha) ou todos os clientes
// ativos do centro de custo de uma vez (checkbox do cabeçalho da coluna,
// respeita a busca ativa no momento — ver customers.service.js::
// setComunicarCentroCusto).
export function setComunicarCliente(empresaId, clientId, comunicar) {
  return http
    .put('/customers-sienge/comunicar', { empresa_id: empresaId, client_id: clientId, comunicar })
    .then((res) => res.data);
}

export function setComunicarCentroCusto(empresaId, costCenterId, comunicar, search = '') {
  return http
    .put('/customers-sienge/comunicar-centro-custo', { empresa_id: empresaId, cost_center_id: costCenterId, comunicar, search })
    .then((res) => res.data);
}
