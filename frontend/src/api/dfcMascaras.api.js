import http from './http';

export function listDfcMascaras(empresaId) {
  return http.get(`/dfc-mascaras/${empresaId}`).then((res) => res.data);
}

// `descricoes` é uma lista: cria todas de uma vez, no fim do grupo (parentId) ou do nível 1 (null).
export function createDfcMascaras(empresaId, { parentId = null, descricoes }) {
  return http.post(`/dfc-mascaras/${empresaId}`, { parent_id: parentId, descricoes }).then((res) => res.data);
}

// Tipos de parcela do Sienge da empresa: [{ sigla, nome, parcelas }] (botão "TIPO PARCELAS" da aba Máscaras).
export function listTiposParcelaDfc(empresaId) {
  return http.get(`/dfc-mascaras/${empresaId}/tipos-parcela`).then((res) => res.data);
}

// Campos parciais: descricao e, no nível 2, tipo_detalhamento ('PLANO_CONTAS' | 'TIPO_PARCELA'),
// parcela_conta_sienge_id, parcela_origens e parcela_tipos (listas).
export function updateDfcMascara(empresaId, id, campos) {
  return http.put(`/dfc-mascaras/${empresaId}/${id}`, campos).then((res) => res.data);
}

export function removeDfcMascara(empresaId, id) {
  return http.delete(`/dfc-mascaras/${empresaId}/${id}`).then((res) => res.data);
}

// estrutura: [{ id, filhos: [id, ...] }, ...] já na ordem final. Devolve a árvore regravada.
export function reordenarDfcMascaras(empresaId, estrutura) {
  return http.put(`/dfc-mascaras/${empresaId}/ordem`, { estrutura }).then((res) => res.data);
}
