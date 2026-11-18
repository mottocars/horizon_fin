import http from './http';

// Operações › Reforma Tributária (backend: modules/reforma-tributaria).

// Aba Impacto: { inicio, ano, anos, periodo, resumo, dre, por_centro, por_ano, sem_projecao, centros_opcoes, parametros, avisos }.
export function getImpactoReforma(empresaId, { centros = [], ano = '' } = {}) {
  return http
    .get(`/reforma-tributaria/${empresaId}/impacto`, { params: { centros: centros.join(',') || undefined, ano: ano || undefined } })
    .then((res) => res.data);
}

// Aba Centros de Custos: { centros: [{ id, nome, apelido, numero_unidades, projecao, config }], irpj_csll_padrao }.
export function listCentrosReforma(empresaId) {
  return http.get(`/reforma-tributaria/${empresaId}/centros`).then((res) => res.data);
}

export function salvarCentroReforma(empresaId, centroId, dados) {
  return http.put(`/reforma-tributaria/${empresaId}/centros/${centroId}`, dados).then((res) => res.data);
}

export function limparCentroReforma(empresaId, centroId) {
  return http.delete(`/reforma-tributaria/${empresaId}/centros/${centroId}`).then((res) => res.data);
}

// Aba Alíquotas: { aliquotas: { ano: { cbs, ibs } }, reducao_imoveis, redutor_residencial, redutor_lote, ret_ibs_cbs,
// ret_irpj_csll, padrao, atualizado_em, usuario, padroes }.
export function getConfigReforma(empresaId) {
  return http.get(`/reforma-tributaria/${empresaId}/configuracoes`).then((res) => res.data);
}

export function salvarConfigReforma(empresaId, dados) {
  return http.put(`/reforma-tributaria/${empresaId}/configuracoes`, dados).then((res) => res.data);
}

export function restaurarConfigReforma(empresaId) {
  return http.delete(`/reforma-tributaria/${empresaId}/configuracoes`).then((res) => res.data);
}
