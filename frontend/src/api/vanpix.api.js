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

// Testa com credenciais soltas (tela de Nova Conexão, antes de salvar) — nada é persistido.
export function testarVanpixCredenciais({ service_key, client_secret, apelidos }) {
  return http
    .post('/integracoes/convenios-bancarios/vanpix/testar', { service_key, client_secret, apelidos })
    .then((res) => res.data);
}

// Testa uma conexão já salva — `overrides` é opcional: o que não vier usa o que já está no
// banco (descriptografado na hora, nunca volta pro navegador).
export function testarVanpixConexao(id, overrides = {}) {
  return http.post(`/integracoes/convenios-bancarios/vanpix/${id}/testar`, overrides).then((res) => res.data);
}
