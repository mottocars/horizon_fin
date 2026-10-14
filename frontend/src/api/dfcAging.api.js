import http from './http';

// Aging a receber (Sienge) pro Orçamento: { valores: [{ centro_id, conta, mes, valor }],
// base: { parcelas, atualizado_em } } — só nas contas com Origem Projeção "SIENGE - AGING".
export function getAgingReceberDfc(empresaId) {
  return http.get(`/dfc-aging/${empresaId}/receber`).then((res) => res.data);
}

// Dispara a atualização da base do contas a receber do Sienge (rotina "Base do contas a receber"
// do Monitor de Integrações). Devolve a execução.
export function atualizarBaseReceberDfc(empresaId) {
  return http.post(`/dfc-aging/${empresaId}/receber/atualizar`).then((res) => res.data);
}

// Execução em andamento (com progresso) ou a última: { status, iniciadoEm, finalizadoEm,
// progresso, resumo, erro } ou null.
export function getExecucaoBaseReceberDfc(empresaId) {
  return http.get(`/dfc-aging/${empresaId}/receber/execucao`).then((res) => res.data);
}
