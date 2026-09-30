import http from './http';

const BASE = '/integracoes/convenios-bancarios/itau';

export function listItauIntegracoes({ page = 1, limit = 8, search = '', ativo, empresaId } = {}) {
  return http.get(BASE, { params: { page, limit, search, ativo, empresa_id: empresaId } }).then((res) => res.data);
}

export function getItauIntegracao(id) {
  return http.get(`${BASE}/${id}`).then((res) => res.data);
}

export function createItauIntegracao(payload) {
  return http.post(BASE, payload).then((res) => res.data);
}

export function updateItauIntegracao(id, payload) {
  return http.put(`${BASE}/${id}`, payload).then((res) => res.data);
}

export function setItauStatus(id, ativo) {
  return http.patch(`${BASE}/${id}/status`, { ativo }).then((res) => res.data);
}

// Usa o token temporário salvo pra emitir o certificado no Itaú — o token é de uso único.
export function gerarCertificadoItau(id) {
  return http.post(`${BASE}/${id}/certificado`).then((res) => res.data);
}

export function renovarCertificadoItau(id) {
  return http.post(`${BASE}/${id}/certificado/renovar`).then((res) => res.data);
}

export function testarItauConexao(id) {
  return http.post(`${BASE}/${id}/testar`).then((res) => res.data);
}
