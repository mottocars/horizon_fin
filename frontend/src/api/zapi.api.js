import http from './http';

export function listZapiIntegracoes({ page = 1, limit = 10, search = '', ativo, empresa_id } = {}) {
  const params = { page, limit, search };
  if (ativo !== undefined) params.ativo = ativo;
  if (empresa_id !== undefined) params.empresa_id = empresa_id;
  return http.get('/integracoes/zapi', { params }).then((res) => res.data);
}

export function getZapiIntegracao(id) {
  return http.get(`/integracoes/zapi/${id}`).then((res) => res.data);
}

export function createZapiIntegracao(data) {
  return http.post('/integracoes/zapi', data).then((res) => res.data);
}

export function updateZapiIntegracao(id, data) {
  return http.put(`/integracoes/zapi/${id}`, data).then((res) => res.data);
}

export function setZapiStatus(id, ativo) {
  return http.patch(`/integracoes/zapi/${id}/status`, { ativo }).then((res) => res.data);
}
