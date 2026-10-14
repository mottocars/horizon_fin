import http from './http';

// `tipo`: 'receber' (contas a receber) ou 'pagar' (contas a pagar).

// Aging do Sienge pro Orçamento: { valores: [{ centro_id, conta, mes, valor }],
// base: { parcelas, atualizado_em } } — só nas contas com Origem Projeção "SIENGE - AGING".
// No pagar os valores já vêm negativos (saída).
export function getAgingDfc(empresaId, tipo) {
  return http.get(`/dfc-aging/${empresaId}/${tipo}`).then((res) => res.data);
}

// Dispara a atualização da base do Sienge (rotina do Monitor de Integrações: "Base do contas a
// receber" ou "Base do contas a pagar"). Devolve a execução.
export function atualizarBaseAgingDfc(empresaId, tipo) {
  return http.post(`/dfc-aging/${empresaId}/${tipo}/atualizar`).then((res) => res.data);
}

// Execução em andamento (com progresso) ou a última: { status, iniciadoEm, finalizadoEm,
// progresso, resumo, erro } ou null.
export function getExecucaoBaseAgingDfc(empresaId, tipo) {
  return http.get(`/dfc-aging/${empresaId}/${tipo}/execucao`).then((res) => res.data);
}
