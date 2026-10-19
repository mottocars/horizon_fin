import http from './http';

// Unidades do Geral dos Empreendimentos por empreendimento (centro com Contrato Caixa), sem o
// contrato da construtora, com as colunas calculadas — ver backend dfc-repasses.
export function listRepassesDfc(empresaId) {
  return http.get(`/dfc-repasses/${empresaId}`).then((res) => res.data);
}

// Mês do registro informado à mão para um cliente ainda sem registro (`mes` 'AAAA-MM'; null = volta ao
// parâmetro "Tempo Entre Assinatura e Registro"). O backend recalcula a Projeção CEF da obra e devolve
// { projecao: resumo | null, aviso }.
export function salvarRegistroManualRepassesDfc(empresaId, { contrato, contratoUnidade, mes }) {
  return http.put(`/dfc-repasses/${empresaId}/registro-manual`, { contrato, contratoUnidade, mes }).then((res) => res.data);
}
