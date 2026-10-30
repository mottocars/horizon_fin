import http from './http';

// Ajustes de lançamentos financeiros (genérico — hoje a DRE › Financeiro usa). O lançamento do Sienge
// nunca muda: o ajuste é por linha de rateio (o lançamento + o centro × natureza originais) e guarda o
// centro, a natureza e o valor que passam a valer no lugar dela. `origem`: 'R' (a receber), 'P' (a
// pagar) ou 'E' (movimento do extrato); `chave`: número do título ou id do lançamento no extrato;
// `linha`: { centro, natureza } originais (null = a linha sem aquele campo).

const params = ({ centro, natureza }) => ({ centro: centro ?? '', natureza: natureza ?? '' });

// { origem, chave, data, parcelas, vencimento, vencimento_ate, documento, documento_nome, numero,
// contraparte, numero_conta, valor_lancamento, travado, linha: { centro_id, centro_nome, natureza_id,
// natureza_nome, valor, percentual }, ajuste: null | { centro_id, centro_nome, natureza_id,
// natureza_nome, valor, observacao, usuario, atualizado_em }, historico, opcoes: { centros, naturezas } }.
export function obterAjusteLancamento(empresaId, origem, chave, linha) {
  return http.get(`/lancamentos-ajustes/${empresaId}/${origem}/${chave}`, { params: params(linha) }).then((res) => res.data);
}

// `valor` positivo (o sinal é o da linha original). Devolve o mesmo formato de obterAjusteLancamento.
export function salvarAjusteLancamento(empresaId, origem, chave, linha, { centro_id, natureza_id, valor, observacao = '' }) {
  return http
    .put(`/lancamentos-ajustes/${empresaId}/${origem}/${chave}`, { centro_id, natureza_id, valor, observacao }, { params: params(linha) })
    .then((res) => res.data);
}

// Volta a linha ao original do Sienge (apaga o ajuste; o histórico fica).
export function restaurarAjusteLancamento(empresaId, origem, chave, linha) {
  return http.delete(`/lancamentos-ajustes/${empresaId}/${origem}/${chave}`, { params: params(linha) }).then((res) => res.data);
}
