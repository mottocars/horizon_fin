import http from './http';

// Aba Correções da DRE: correção monetária das parcelas a receber do Sienge (sie_income).

// { centros: [{ id, nome, paga, reparcelada, em_aberto, parcelas, clientes: [{ id, nome, unidades,
// parcelas, paga, reparcelada, em_aberto }] }], ultima_atualizacao } — só os centros com "Realiza DRE".
export function listarCorrecoesDre(empresaId) {
  return http.get(`/dre-correcoes/${empresaId}`).then((res) => res.data);
}

// Parcelas com correção de um cliente num centro: [{ titulo, parcela, documento, documento_numero,
// unidade, indexador, vencimento, data_baixa, paga, reparcelada, em_aberto }].
export function listarParcelasCorrecaoDre(empresaId, centroId, clienteId) {
  return http.get(`/dre-correcoes/${empresaId}/centros/${centroId}/clientes/${clienteId}/parcelas`).then((res) => res.data);
}
