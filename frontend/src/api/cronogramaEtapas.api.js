import http from './http';

export function listCronogramaEtapas(empresaId) {
  return http.get(`/cronograma-etapas/${empresaId}`).then((res) => res.data);
}

// `descricoes` é uma lista: cria todas de uma vez, no fim da lista. `cores`: a cor de cada uma, na
// mesma posição.
export function createCronogramaEtapas(empresaId, descricoes, cores = []) {
  return http.post(`/cronograma-etapas/${empresaId}`, { descricoes, cores }).then((res) => res.data);
}

// Manda só o que mudou (nome e/ou cor).
export function updateCronogramaEtapa(empresaId, id, { descricao, cor }) {
  return http.put(`/cronograma-etapas/${empresaId}/${id}`, { descricao, cor }).then((res) => res.data);
}

export function removeCronogramaEtapa(empresaId, id) {
  return http.delete(`/cronograma-etapas/${empresaId}/${id}`).then((res) => res.data);
}

// ids: todas as etapas da empresa já na ordem final. Devolve a lista regravada.
export function reordenarCronogramaEtapas(empresaId, ids) {
  return http.put(`/cronograma-etapas/${empresaId}/ordem`, { ids }).then((res) => res.data);
}
