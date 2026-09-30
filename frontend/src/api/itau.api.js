import http from './http';

const BASE = '/integracoes/convenios-bancarios/itau';

export function listItauIntegracoes({ page = 1, limit = 8, search = '', ativo, empresaId } = {}) {
  return http.get(BASE, { params: { page, limit, search, ativo, empresa_id: empresaId } }).then((res) => res.data);
}

export function getItauConexao(id) {
  return http.get(`${BASE}/${id}`).then((res) => res.data);
}

// Etapa "Buscar dados": valida nome/credencial/CNPJ e consulta o CNPJ (razão social, cidade, UF).
export function conferirDadosItau({ nome, client_id, cnpj }) {
  return http.post(`${BASE}/conferir`, { nome, client_id, cnpj }).then((res) => res.data);
}

// Etapa "Gerar certificado": cria a conexão e usa o token temporário (uso único) no Itaú.
export function gerarCertificadoItau(payload) {
  return http.post(BASE, payload, { timeout: 150000 }).then((res) => res.data);
}

// Gerar de novo numa conexão com erro/vencida, com um token NOVO.
export function gerarNovamenteItau(id, payload) {
  return http.post(`${BASE}/${id}/certificado`, payload, { timeout: 150000 }).then((res) => res.data);
}

export function atualizarItauConexao(id, payload) {
  return http.put(`${BASE}/${id}`, payload).then((res) => res.data);
}

export function setItauStatus(id, ativo) {
  return http.patch(`${BASE}/${id}/status`, { ativo }).then((res) => res.data);
}

export function testarTokenItau(id) {
  return http.post(`${BASE}/${id}/testar-token`).then((res) => res.data);
}

export function testarExtratoItau(id) {
  return http.post(`${BASE}/${id}/testar-extrato`).then((res) => res.data);
}

export function renovarCertificadoItau(id) {
  return http.post(`${BASE}/${id}/renovar`, null, { timeout: 150000 }).then((res) => res.data);
}
