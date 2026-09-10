import http from './http';

export function listMascaras(tipo, empresaId, grupo = '') {
  return http.get('/mascaras', { params: { tipo, empresa_id: empresaId, grupo } }).then((res) => res.data);
}

export function createMascaraItem(tipo, empresaId, grupo = '') {
  return http.post('/mascaras', { tipo, empresa_id: empresaId, grupo }).then((res) => res.data);
}

export function updateMascaraItemDescricao(id, descricao) {
  return http.put(`/mascaras/${id}`, { descricao }).then((res) => res.data);
}

export function deleteMascaraItem(id) {
  return http.delete(`/mascaras/${id}`).then((res) => res.data);
}
