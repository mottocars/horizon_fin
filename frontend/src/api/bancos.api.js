import http from './http';

// Sem paginação (pedido do usuário) — 1000 já cobre os ~464 bancos de hoje com folga.
export function listBancosCadastro({ search = '' } = {}) {
  return http.get('/bancos', { params: { limit: 1000, search } }).then((res) => res.data);
}

// logo: data URI (ver utils/imagemLogoBanco.js), já redimensionada no navegador.
export function salvarLogoBanco(codigo, logo) {
  return http.put(`/bancos/${codigo}/logo`, { logo }).then((res) => res.data);
}

export function removerLogoBanco(codigo) {
  return http.delete(`/bancos/${codigo}/logo`).then((res) => res.data);
}
