import http from './http';

export function listSiengeIntegracoes({ page = 1, limit = 10, search = '', ativo, empresaId } = {}) {
  const params = { page, limit, search };
  if (ativo !== undefined) params.ativo = ativo;
  if (empresaId) params.empresaId = empresaId;
  return http.get('/integracoes/sienge', { params }).then((res) => res.data);
}

export function getSiengeIntegracao(id) {
  return http.get(`/integracoes/sienge/${id}`).then((res) => res.data);
}

export function createSiengeIntegracao(data) {
  return http.post('/integracoes/sienge', data).then((res) => res.data);
}

export function updateSiengeIntegracao(id, data) {
  return http.put(`/integracoes/sienge/${id}`, data).then((res) => res.data);
}

export function setSiengeStatus(id, ativo) {
  return http.patch(`/integracoes/sienge/${id}/status`, { ativo }).then((res) => res.data);
}
