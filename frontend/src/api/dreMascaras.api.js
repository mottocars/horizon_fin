import http from './http';

export function listDreMascaras(empresaId) {
  return http.get(`/dre-mascaras/${empresaId}`).then((res) => res.data);
}

// `descricoes` é uma lista: cria todas de uma vez, no fim do grupo (parentId) ou do nível 1 (null).
export function createDreMascaras(empresaId, { parentId = null, descricoes }) {
  return http.post(`/dre-mascaras/${empresaId}`, { parent_id: parentId, descricoes }).then((res) => res.data);
}

// `campos` é parcial: { descricao } pra renomear, { totalizadora } / { realiza_poc } pras marcações.
export function updateDreMascara(empresaId, id, campos) {
  return http.put(`/dre-mascaras/${empresaId}/${id}`, campos).then((res) => res.data);
}

export function removeDreMascara(empresaId, id) {
  return http.delete(`/dre-mascaras/${empresaId}/${id}`).then((res) => res.data);
}

// estrutura: [{ id, filhos: [id, ...] }, ...] já na ordem final. Devolve a árvore regravada.
export function reordenarDreMascaras(empresaId, estrutura) {
  return http.put(`/dre-mascaras/${empresaId}/ordem`, { estrutura }).then((res) => res.data);
}
