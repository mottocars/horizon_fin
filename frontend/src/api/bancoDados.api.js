import http from './http';

export function listBancoDadosIntegracoes({ page = 1, limit = 10, search = '', ativo } = {}) {
  const params = { page, limit, search };
  if (ativo !== undefined) params.ativo = ativo;
  return http.get('/integracoes/banco-dados', { params }).then((res) => res.data);
}

export function getBancoDadosIntegracao(id) {
  return http.get(`/integracoes/banco-dados/${id}`).then((res) => res.data);
}

export function createBancoDadosIntegracao(data) {
  return http.post('/integracoes/banco-dados', data).then((res) => res.data);
}

export function updateBancoDadosIntegracao(id, data) {
  return http.put(`/integracoes/banco-dados/${id}`, data).then((res) => res.data);
}

export function setBancoDadosStatus(id, ativo) {
  return http.patch(`/integracoes/banco-dados/${id}/status`, { ativo }).then((res) => res.data);
}

export function testarConexaoBancoDados(data) {
  return http.post('/integracoes/banco-dados/testar', data).then((res) => res.data);
}
