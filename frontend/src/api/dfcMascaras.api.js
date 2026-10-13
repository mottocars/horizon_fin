import http from './http';

export function listDfcMascaras(empresaId) {
  return http.get(`/dfc-mascaras/${empresaId}`).then((res) => res.data);
}

// `descricoes` é uma lista: cria todas de uma vez, no fim do grupo (parentId) ou do nível 1 (null).
export function createDfcMascaras(empresaId, { parentId = null, descricoes }) {
  return http.post(`/dfc-mascaras/${empresaId}`, { parent_id: parentId, descricoes }).then((res) => res.data);
}

export function updateDfcMascara(empresaId, id, { descricao }) {
  return http.put(`/dfc-mascaras/${empresaId}/${id}`, { descricao }).then((res) => res.data);
}

export function removeDfcMascara(empresaId, id) {
  return http.delete(`/dfc-mascaras/${empresaId}/${id}`).then((res) => res.data);
}

// estrutura: [{ id, filhos: [id, ...] }, ...] já na ordem final. Devolve a árvore regravada.
export function reordenarDfcMascaras(empresaId, estrutura) {
  return http.put(`/dfc-mascaras/${empresaId}/ordem`, { estrutura }).then((res) => res.data);
}
