import http from './http';

export function listPrevisionIntegracoes({ page = 1, limit = 10, search = '', ativo, empresaId } = {}) {
  const params = { page, limit, search };
  if (ativo !== undefined) params.ativo = ativo;
  if (empresaId) params.empresaId = empresaId;
  return http.get('/integracoes/prevision', { params }).then((res) => res.data);
}

export function getPrevisionIntegracao(id) {
  return http.get(`/integracoes/prevision/${id}`).then((res) => res.data);
}

export function createPrevisionIntegracao(data) {
  return http.post('/integracoes/prevision', data).then((res) => res.data);
}

export function updatePrevisionIntegracao(id, data) {
  return http.put(`/integracoes/prevision/${id}`, data).then((res) => res.data);
}

export function setPrevisionStatus(id, ativo) {
  return http.patch(`/integracoes/prevision/${id}/status`, { ativo }).then((res) => res.data);
}

export function sincronizarPrevision(empresaId) {
  return http.post(`/prevision-dashboards/${empresaId}/sincronizar`).then((res) => res.data);
}

export function listPrevisionProjetos(empresaId) {
  return http.get(`/prevision-dashboards/${empresaId}/projetos`).then((res) => res.data);
}
