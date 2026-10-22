import http from './http';

// Mesmo esquema de dfcPlanoContas.api.js. `centroId` (opcional) em todas: a versão própria do plano
// daquele centro de custo; sem ele, o plano Global (vale pra todos os centros sem versão própria).

// Máscara DRE das contas classificadas: [{ sienge_id, mascara_id }]. Conta ausente = sem máscara.
export function listClassificacoesPlanoDre(empresaId, centroId = null) {
  return http
    .get(`/dre-plano-contas/${empresaId}`, { params: centroId ? { centro: centroId } : {} })
    .then((res) => res.data);
}

// `mascaraId` null limpa a classificação da conta.
export function updateClassificacaoPlanoDre(empresaId, siengeId, mascaraId, { centroId = null } = {}) {
  return http
    .put(`/dre-plano-contas/${empresaId}/${siengeId}`, { mascara_id: mascaraId, centro: centroId })
    .then((res) => res.data);
}

// Centros com versão própria do plano: [{ centro_id, name, criado_em, criado_por }].
export function listVersoesPlanoDre(empresaId) {
  return http.get(`/dre-plano-contas/${empresaId}/versoes`).then((res) => res.data);
}

// Cria o plano próprio do centro. `copiarDe`: 'global' (cópia do Global), 'branco' (sem nada) ou o
// id do centro cujo plano próprio copiar.
export function criarVersaoPlanoDre(empresaId, centroId, copiarDe) {
  return http
    .post(`/dre-plano-contas/${empresaId}/versoes`, { centro_id: centroId, copiar_de: copiarDe })
    .then((res) => res.data);
}

// Exclui a versão do centro — ele volta a seguir o Global.
export function excluirVersaoPlanoDre(empresaId, centroId) {
  return http.delete(`/dre-plano-contas/${empresaId}/versoes/${centroId}`).then((res) => res.data);
}

// Resumo pros cards da aba Plano de Contas: { analiticas, global: { com_mascara, centros_seguindo,
// atualizado_em }, versoes: [{ centro_id, name, natureza, criado_em, criado_por, com_mascara,
// atualizado_em }] }.
export function resumoPlanosDre(empresaId) {
  return http.get(`/dre-plano-contas/${empresaId}/resumo`).then((res) => res.data);
}
