import http from './http';

export function listEmailIntegracoes({ page = 1, limit = 10, search = '', ativo, empresa_id } = {}) {
  const params = { page, limit, search };
  if (ativo !== undefined) params.ativo = ativo;
  if (empresa_id !== undefined) params.empresa_id = empresa_id;
  return http.get('/integracoes/email', { params }).then((res) => res.data);
}

export function getEmailIntegracao(id) {
  return http.get(`/integracoes/email/${id}`).then((res) => res.data);
}

export function createEmailIntegracao(data) {
  return http.post('/integracoes/email', data).then((res) => res.data);
}

export function updateEmailIntegracao(id, data) {
  return http.put(`/integracoes/email/${id}`, data).then((res) => res.data);
}

export function setEmailStatus(id, ativo) {
  return http.patch(`/integracoes/email/${id}/status`, { ativo }).then((res) => res.data);
}

// Testa a conexão SMTP antes de salvar — `id` é opcional (só faz sentido
// editando, pra poder testar sem reenviar a senha já salva; ver
// email.controller.js::testarConexao).
export function testarConexaoEmail(data) {
  return http.post('/integracoes/email/testar', data).then((res) => res.data);
}
