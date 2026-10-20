import http from './http';

// Máscara "Etapas do Centro de Custo" da empresa — a lista única de etapas de obra, editada em
// Cadastros > Máscaras e na aba Etapas de Cronogramas Obras. [{ id, sequencia, descricao, cor }]
export function listEtapasCentroCusto(empresaId) {
  return http.get(`/etapas-centro-custo/${empresaId}`).then((res) => res.data);
}

// `descricoes` é uma lista: cria todas de uma vez, no fim da lista. `cores`: a cor de cada uma, na
// mesma posição.
export function createEtapasCentroCusto(empresaId, descricoes, cores = []) {
  return http.post(`/etapas-centro-custo/${empresaId}`, { descricoes, cores }).then((res) => res.data);
}

// Manda só o que mudou (nome e/ou cor).
export function updateEtapaCentroCusto(empresaId, id, { descricao, cor }) {
  return http.put(`/etapas-centro-custo/${empresaId}/${id}`, { descricao, cor }).then((res) => res.data);
}

export function removeEtapaCentroCusto(empresaId, id) {
  return http.delete(`/etapas-centro-custo/${empresaId}/${id}`).then((res) => res.data);
}

// ids: todas as etapas da empresa já na ordem final. Devolve a lista regravada.
export function reordenarEtapasCentroCusto(empresaId, ids) {
  return http.put(`/etapas-centro-custo/${empresaId}/ordem`, { ids }).then((res) => res.data);
}
