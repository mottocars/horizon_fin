import http from './http';

export function listActioonIntegracoes({ page = 1, limit = 10, search = '', ativo } = {}) {
  const params = { page, limit, search };
  if (ativo !== undefined) params.ativo = ativo;
  return http.get('/integracoes/actioon', { params }).then((res) => res.data);
}

export function getActioonIntegracao(id) {
  return http.get(`/integracoes/actioon/${id}`).then((res) => res.data);
}

export function createActioonIntegracao(data) {
  return http.post('/integracoes/actioon', data).then((res) => res.data);
}

export function updateActioonIntegracao(id, data) {
  return http.put(`/integracoes/actioon/${id}`, data).then((res) => res.data);
}

export function setActioonStatus(id, ativo) {
  return http.patch(`/integracoes/actioon/${id}/status`, { ativo }).then((res) => res.data);
}

export function testarConexaoActioon(data) {
  return http.post('/integracoes/actioon/testar', data).then((res) => res.data);
}
