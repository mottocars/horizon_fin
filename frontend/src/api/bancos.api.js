import http from './http';

export function listBancosCadastro({ page = 1, limit = 20, search = '' } = {}) {
  return http.get('/bancos', { params: { page, limit, search } }).then((res) => res.data);
}

// logo: data URI (ver utils/imagemLogoBanco.js), já redimensionada no navegador.
export function salvarLogoBanco(codigo, logo) {
  return http.put(`/bancos/${codigo}/logo`, { logo }).then((res) => res.data);
}

export function removerLogoBanco(codigo) {
  return http.delete(`/bancos/${codigo}/logo`).then((res) => res.data);
}
