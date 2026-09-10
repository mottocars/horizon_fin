import http from './http';

export function listConstrutorVendasIntegracoes({ page = 1, limit = 10, search = '', ativo } = {}) {
  const params = { page, limit, search };
  if (ativo !== undefined) params.ativo = ativo;
  return http.get('/integracoes/construtor-de-vendas', { params }).then((res) => res.data);
}

export function getConstrutorVendasIntegracao(id) {
  return http.get(`/integracoes/construtor-de-vendas/${id}`).then((res) => res.data);
}

export function createConstrutorVendasIntegracao(data) {
  return http.post('/integracoes/construtor-de-vendas', data).then((res) => res.data);
}

export function updateConstrutorVendasIntegracao(id, data) {
  return http.put(`/integracoes/construtor-de-vendas/${id}`, data).then((res) => res.data);
}

export function setConstrutorVendasStatus(id, ativo) {
  return http.patch(`/integracoes/construtor-de-vendas/${id}/status`, { ativo }).then((res) => res.data);
}
