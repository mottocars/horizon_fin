import http from './http';

export function listMcpConectores({ page = 1, limit = 10, search = '', ativo, empresa_id } = {}) {
  const params = { page, limit, search };
  if (ativo !== undefined) params.ativo = ativo;
  if (empresa_id !== undefined) params.empresa_id = empresa_id;
  return http.get('/integracoes/mcp', { params }).then((res) => res.data);
}

export function getMcpConector(id) {
  return http.get(`/integracoes/mcp/${id}`).then((res) => res.data);
}

export function createMcpConector(data) {
  return http.post('/integracoes/mcp', data).then((res) => res.data);
}

export function updateMcpConector(id, data) {
  return http.put(`/integracoes/mcp/${id}`, data).then((res) => res.data);
}

export function setMcpStatus(id, ativo) {
  return http.patch(`/integracoes/mcp/${id}/status`, { ativo }).then((res) => res.data);
}

// Conector DFC Construtoras: sessões de login ativas (Claude) e encerrar todas.
export function listMcpSessoes(id) {
  return http.get(`/integracoes/mcp/${id}/sessoes`).then((res) => res.data);
}

export function encerrarMcpSessoes(id) {
  return http.post(`/integracoes/mcp/${id}/encerrar-sessoes`).then((res) => res.data);
}

export function regenerarMcpToken(id) {
  return http.post(`/integracoes/mcp/${id}/regenerar-token`).then((res) => res.data);
}
