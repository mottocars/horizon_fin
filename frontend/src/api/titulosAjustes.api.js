import http from './http';

// Ajustes de títulos do contas a receber / a pagar (genérico — hoje a DRE › Financeiro usa). O
// título do Sienge nunca muda: o ajuste guarda as linhas (centro × natureza × valor) que substituem
// o rateio original. `origem`: 'R' (a receber) ou 'P' (a pagar); `billId`: número do título.

// { origem, titulo, documento, documento_nome, numero, contraparte, emissao, valor_original, travado,
// parcelas: [{ parcela, emissao, vencimento, valor, saldo }], original: [{ centro_id, centro_nome,
// natureza_id, natureza_nome, valor }], ajuste: null | { observacao, atualizado_em, usuario, linhas },
// historico: [{ acao, antes, depois, criado_em, usuario }], opcoes: { centros, naturezas } }.
export function obterTituloAjuste(empresaId, origem, billId) {
  return http.get(`/titulos-ajustes/${empresaId}/${origem}/${billId}`).then((res) => res.data);
}

// `linhas`: [{ centro_id, natureza_id, valor (> 0) }]. Devolve o título atualizado (mesmo formato).
export function salvarAjusteTitulo(empresaId, origem, billId, { linhas, observacao = '' }) {
  return http.put(`/titulos-ajustes/${empresaId}/${origem}/${billId}`, { linhas, observacao }).then((res) => res.data);
}

// Volta ao original do Sienge (apaga o ajuste; o histórico fica).
export function restaurarTituloAjuste(empresaId, origem, billId) {
  return http.delete(`/titulos-ajustes/${empresaId}/${origem}/${billId}`).then((res) => res.data);
}
