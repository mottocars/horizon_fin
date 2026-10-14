import http from './http';

// `centroId` (opcional) em todas: a versão própria do plano daquele centro de custo; sem ele, o
// plano Global (vale pra todos os centros que não têm versão própria).

// Máscara DFC e Origem da Projeção já escolhidas nas contas: [{ sienge_id, mascara_id, origem_projecao }].
export function listClassificacoesPlanoDfc(empresaId, centroId = null) {
  return http
    .get(`/dfc-plano-contas/${empresaId}`, { params: centroId ? { centro: centroId } : {} })
    .then((res) => res.data);
}

// `transferir`: a origem CEF já está em outra conta e o usuário confirmou trazer pra esta.
// Devolve também `origem_retirada_de` (a conta de onde a origem saiu, ou null).
export function updateClassificacaoPlanoDfc(
  empresaId,
  siengeId,
  { mascara_id, origem_projecao },
  { transferir = false, centroId = null } = {}
) {
  return http
    .put(`/dfc-plano-contas/${empresaId}/${siengeId}`, { mascara_id, origem_projecao, transferir, centro: centroId })
    .then((res) => res.data);
}

// Centros com versão própria do plano: [{ centro_id, name, criado_em, criado_por }].
export function listVersoesPlanoDfc(empresaId) {
  return http.get(`/dfc-plano-contas/${empresaId}/versoes`).then((res) => res.data);
}

// Cria a versão do centro copiando o plano Global.
export function criarVersaoPlanoDfc(empresaId, centroId) {
  return http.post(`/dfc-plano-contas/${empresaId}/versoes`, { centro_id: centroId }).then((res) => res.data);
}

// Exclui a versão do centro — ele volta a seguir o Global.
export function excluirVersaoPlanoDfc(empresaId, centroId) {
  return http.delete(`/dfc-plano-contas/${empresaId}/versoes/${centroId}`).then((res) => res.data);
}

// Global + versão de cada centro, pro Orçamento: { global: [...], centros: { [centroId]: [...] } }.
export function listTodasClassificacoesPlanoDfc(empresaId) {
  return http.get(`/dfc-plano-contas/${empresaId}/todas`).then((res) => res.data);
}

// Resumo pros cards da aba Plano Contas: { analiticas, global: { com_mascara, com_origem,
// centros_seguindo, atualizado_em }, versoes: [{ centro_id, name, natureza, criado_em, criado_por,
// com_mascara, com_origem, atualizado_em }] }.
export function resumoPlanosDfc(empresaId) {
  return http.get(`/dfc-plano-contas/${empresaId}/resumo`).then((res) => res.data);
}
