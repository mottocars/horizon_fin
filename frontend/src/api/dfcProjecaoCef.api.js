import http from './http';

// Obras que entram na Projeção CEF (Tipo = Obra e Projeta DFC), com `elegivel` / `motivo` e a
// última atualização.
export function listElegiveisProjecaoCef(empresaId) {
  return http.get(`/dfc-projecao-cef/${empresaId}/elegiveis`).then((res) => res.data);
}

// Recalcula e regrava a projeção de UMA obra; devolve o resumo (meses, unidades, totais).
export function atualizarProjecaoCef(empresaId, siengeId) {
  return http.post(`/dfc-projecao-cef/${empresaId}/${siengeId}/atualizar`).then((res) => res.data);
}

// Valores da projeção pro Orçamento: { valores: [{ sienge_id, conta, mes, valor }], execucoes, avisos }.
export function getOrcamentoProjecaoCef(empresaId) {
  return http.get(`/dfc-projecao-cef/${empresaId}/orcamento`).then((res) => res.data);
}
