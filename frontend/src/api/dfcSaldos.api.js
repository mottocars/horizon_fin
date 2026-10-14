import http from './http';

// Saldo de cada conta com "Projeta DFC" na abertura do dia `data` ('AAAA-MM-DD'), a partir do
// extrato do Sienge: { data, total, contas: [{ company_id, numero_conta, nome, saldo, ... }], sem_extrato }.
export function getSaldosContasDfc(empresaId, data) {
  return http.get(`/dfc-saldos/${empresaId}`, { params: { data } }).then((res) => res.data);
}

// Situação da base (contas já buscadas e quando): { base: { parcelas, contas, atualizado_em } }.
export function getBaseSaldosContasDfc(empresaId) {
  return http.get(`/dfc-saldos/${empresaId}/base`).then((res) => res.data);
}

// Dispara a rotina "Saldos das contas (Sienge)" do Monitor de Integrações.
export function atualizarSaldosContasDfc(empresaId) {
  return http.post(`/dfc-saldos/${empresaId}/atualizar`).then((res) => res.data);
}

export function getExecucaoSaldosContasDfc(empresaId) {
  return http.get(`/dfc-saldos/${empresaId}/execucao`).then((res) => res.data);
}

// Realizado do fluxo de caixa entre os meses `de` e `ate` ('AAAA-MM'): { valores: [{ centro_id,
// sienge_id (natureza), mes, valor }], saldos: { 'AAAA-MM': saldo de abertura }, extrato_ate }.
export function getRealizadoDfc(empresaId, de, ate) {
  return http.get(`/dfc-saldos/${empresaId}/realizado`, { params: { de, ate } }).then((res) => res.data);
}
