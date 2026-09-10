import http from './http';

export function listUsuarios({ page = 1, limit = 10, search = '', ativo, empresaId } = {}) {
  const params = { page, limit, search };
  if (ativo !== undefined) params.ativo = ativo;
  if (empresaId) params.empresaId = empresaId;
  return http.get('/usuarios', { params }).then((res) => res.data);
}

export function getUsuario(id) {
  return http.get(`/usuarios/${id}`).then((res) => res.data);
}

export function createUsuario(data) {
  return http.post('/usuarios', data).then((res) => res.data);
}

export function updateUsuario(id, data) {
  return http.put(`/usuarios/${id}`, data).then((res) => res.data);
}

export function setUsuarioStatus(id, ativo) {
  return http.patch(`/usuarios/${id}/status`, { ativo }).then((res) => res.data);
}
