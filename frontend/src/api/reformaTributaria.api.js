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

// Aba Impacto DFC: { inicio, ano, anos, periodo, versao, resumo, dfc, linhas, por_centro, parametros, centros_opcoes, contas }.
export function getImpactoDfcReforma(empresaId, { centros = [], ano = '' } = {}) {
  return http
    .get(`/reforma-tributaria/${empresaId}/impacto-dfc`, { params: { centros: centros.join(',') || undefined, ano: ano || undefined } })
    .then((res) => res.data);
}

// Aba Configurações DFC: { contas_receita, contas_custo, contas_ret, prazo_recolhimento, split_inicio, saldo_credor,
// prazo_ressarcimento, padrao, atualizado_em, usuario, contas: [{ id, nome, mascara }], sugestao, padroes }.
export function getConfigDfcReforma(empresaId) {
  return http.get(`/reforma-tributaria/${empresaId}/configuracoes-dfc`).then((res) => res.data);
}

export function salvarConfigDfcReforma(empresaId, dados) {
  return http.put(`/reforma-tributaria/${empresaId}/configuracoes-dfc`, dados).then((res) => res.data);
}

export function restaurarConfigDfcReforma(empresaId) {
  return http.delete(`/reforma-tributaria/${empresaId}/configuracoes-dfc`).then((res) => res.data);
}
