import http from './http';

// Aba Financeiro da DRE.

// Exercícios da empresa, do ano do primeiro vencimento (contas a pagar e a receber) até o atual, do
// mais novo pro mais antigo: { primeiro_vencimento, ano_atual, exercicios: [{ ano, receber, pagar }] }
// (receber/pagar = parcelas que vencem no ano).
export function listarExerciciosDre(empresaId) {
  return http.get(`/dre-financeiro/${empresaId}/exercicios`).then((res) => res.data);
}
