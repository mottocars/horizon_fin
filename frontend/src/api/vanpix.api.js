import http from './http';

export function listVanpixIntegracoes({ page = 1, limit = 8, search = '', ativo, empresaId } = {}) {
  return http
    .get('/integracoes/convenios-bancarios/vanpix', {
      params: { page, limit, search, ativo, empresa_id: empresaId },
    })
    .then((res) => res.data);
}

export function getVanpixIntegracao(id) {
  return http.get(`/integracoes/convenios-bancarios/vanpix/${id}`).then((res) => res.data);
}

export function createVanpixIntegracao(payload) {
  return http.post('/integracoes/convenios-bancarios/vanpix', payload).then((res) => res.data);
}

export function updateVanpixIntegracao(id, payload) {
  return http.put(`/integracoes/convenios-bancarios/vanpix/${id}`, payload).then((res) => res.data);
}

export function setVanpixStatus(id, ativo) {
  return http.patch(`/integracoes/convenios-bancarios/vanpix/${id}/status`, { ativo }).then((res) => res.data);
}
