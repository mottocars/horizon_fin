import http from './http';

// Aba Financeiro da DRE.

// Exercícios da empresa, do ano do primeiro vencimento (contas a pagar e a receber) até o atual, do
// mais novo pro mais antigo: { primeiro_vencimento, ano_atual, exercicios: [{ ano, receber, pagar,
// travado }] } (receber/pagar = parcelas que vencem no ano; travado = o ano atual, só visualização).
export function listarExerciciosDre(empresaId) {
  return http.get(`/dre-financeiro/${empresaId}/exercicios`).then((res) => res.data);
}

// Lançamentos do exercício, uma página: { ano, travado, pagina, por_pagina, total, linhas: [{ origem
// ('R' a receber, 'P' a pagar, 'E' movimento — extrato sem título), data (emissão; no movimento, a
// data do extrato), vencimento, titulo, parcela, documento, documento_nome, numero, contraparte,
// centro_id, centro_nome, natureza_id, natureza_nome, valor (com sinal) }] }. Filtros em listas
// (vazio = todos; '' dentro da lista = sem o campo) e período `de`/`ate` ('AAAA-MM-DD', dentro do ano).
export function listarLancamentosExercicioDre(
  empresaId,
  ano,
  { origens = [], documentos = [], centros = [], contrapartes = [], de = '', ate = '', busca = '', pagina = 1, porPagina = 100 } = {},
  { signal } = {}
) {
  const params = { pagina, por_pagina: porPagina };
  if (origens.length) params.origem = origens;
  if (documentos.length) params.documento = documentos;
  if (centros.length) params.centro = centros;
  if (contrapartes.length) params.contraparte = contrapartes;
  if (de) params.de = de;
  if (ate) params.ate = ate;
  if (busca) params.busca = busca;
  return http.get(`/dre-financeiro/${empresaId}/exercicios/${ano}/lancamentos`, { params, signal }).then((res) => res.data);
}

// Opções dos filtros do exercício: { documentos, centros, contrapartes: [{ valor, nome, n }] } (valor
// '' = lançamentos sem o campo).
export function listarFiltrosExercicioDre(empresaId, ano) {
  return http.get(`/dre-financeiro/${empresaId}/exercicios/${ano}/filtros`).then((res) => res.data);
}
