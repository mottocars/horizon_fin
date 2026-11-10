import http from './http';

// Cadastros › Contas Pagar / Receber. Título: { tipo 'PAGAR'|'RECEBER', tipo_documento 'FINANCEIRO'|
// 'PROJECAO_PLS_CEF', pessoa_id, documento, data_emissao, historico, valor, parcelas: [{ vencimento, valor }],
// rateios: [{ centro_id, natureza_id, valor }] }.

// { centros, naturezas, fornecedores, clientes } da empresa.
export function opcoesContasPagarReceber(empresaId) {
  return http.get(`/contas-pagar-receber/${empresaId}/opcoes`).then((res) => res.data);
}

// Parcelas com vencimento entre `inicio` e `fim` ('AAAA-MM-DD'), uma linha por parcela.
export function listarTitulos(empresaId, inicio, fim) {
  return http.get(`/contas-pagar-receber/${empresaId}/titulos`, { params: { inicio, fim } }).then((res) => res.data);
}

export function obterTitulo(empresaId, id) {
  return http.get(`/contas-pagar-receber/${empresaId}/titulos/${id}`).then((res) => res.data);
}

export function criarTitulo(empresaId, dados) {
  return http.post(`/contas-pagar-receber/${empresaId}/titulos`, dados).then((res) => res.data);
}

export function alterarTitulo(empresaId, id, dados) {
  return http.put(`/contas-pagar-receber/${empresaId}/titulos/${id}`, dados).then((res) => res.data);
}

export function excluirTitulo(empresaId, id) {
  return http.delete(`/contas-pagar-receber/${empresaId}/titulos/${id}`).then((res) => res.data);
}

// Baixa de uma parcela: { data_baixa, valor_baixa }.
export function baixarParcela(empresaId, parcelaId, dados) {
  return http.post(`/contas-pagar-receber/${empresaId}/parcelas/${parcelaId}/baixa`, dados).then((res) => res.data);
}

// Projeção PLS CEF › Avanços: curva diária do Prevision do centro de custo
// { centro_id, centro_nome, tem_prevision, pontos: [{ data 'AAAA-MM-DD', previsto % acumulado }] }.
export function avancoPrevisto(empresaId, centroId) {
  return http.get(`/contas-pagar-receber/${empresaId}/avanco-previsto/${centroId}`).then((res) => res.data);
}

export function estornarBaixa(empresaId, parcelaId) {
  return http.delete(`/contas-pagar-receber/${empresaId}/parcelas/${parcelaId}/baixa`).then((res) => res.data);
}
