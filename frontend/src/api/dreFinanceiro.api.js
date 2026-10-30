import http from './http';

// Aba Financeiro da DRE.

// Exercícios da empresa, do ano do primeiro vencimento (contas a pagar e a receber) até o atual, do
// mais novo pro mais antigo: { primeiro_vencimento, ano_atual, exercicios: [{ ano, receber, pagar,
// travado }] } (receber/pagar = parcelas que vencem no ano; travado = o ano atual, só visualização).
export function listarExerciciosDre(empresaId) {
  return http.get(`/dre-financeiro/${empresaId}/exercicios`).then((res) => res.data);
}

// Lançamentos do exercício, uma página: { ano, travado, pagina, por_pagina, total, totais: { receber,
// pagar, extrato_entradas, extrato_saidas, resultado }, linhas: [{ origem ('R' a receber, 'P' a pagar,
// 'E' extrato sem título), data, emissao, titulo, parcela, documento, documento_nome, numero,
// contraparte, centro_id, centro_nome, natureza_id, natureza_nome, valor (com sinal), situacao }] }.
// Filtros em listas (vazio = todos; '' dentro da lista = sem o campo).
export function listarLancamentosExercicioDre(empresaId, ano, { origens = [], documentos = [], centros = [], naturezas = [], busca = '', pagina = 1, porPagina = 100 } = {}) {
  const params = { pagina, por_pagina: porPagina };
  if (origens.length) params.origem = origens.join(',');
  if (documentos.length) params.documento = documentos.join(',');
  if (centros.length) params.centro = centros.join(',');
  if (naturezas.length) params.natureza = naturezas.join(',');
  if (busca) params.busca = busca;
  return http.get(`/dre-financeiro/${empresaId}/exercicios/${ano}/lancamentos`, { params }).then((res) => res.data);
}

// Opções dos filtros de coluna do exercício: { documentos, centros, naturezas: [{ valor, nome, n }] }
// (valor '' = lançamentos sem o campo).
export function listarFiltrosExercicioDre(empresaId, ano) {
  return http.get(`/dre-financeiro/${empresaId}/exercicios/${ano}/filtros`).then((res) => res.data);
}
