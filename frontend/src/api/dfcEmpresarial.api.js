import http from './http';

// Situação da base do Orçamento Empresarial do Sienge: { base: { parcelas, registros, orcamentos, atualizado_em } }.
export function getBaseEmpresarialDfc(empresaId) {
  return http.get(`/dfc-empresarial/${empresaId}`).then((res) => res.data);
}

// Dispara a rotina "Base do orçamento empresarial (Sienge)" do Monitor de Integrações.
export function atualizarBaseEmpresarialDfc(empresaId) {
  return http.post(`/dfc-empresarial/${empresaId}/atualizar`).then((res) => res.data);
}

// Execução em andamento (com progresso) ou a última.
export function getExecucaoEmpresarialDfc(empresaId) {
  return http.get(`/dfc-empresarial/${empresaId}/execucao`).then((res) => res.data);
}
