import http from './http';

// Ver backend relatorio-desempenho-cobranca/desempenhoCobranca.service.js.
export function getDesempenhoCobranca(empresaId, { dataInicio, dataFim }) {
  return http
    .get(`/relatorios/desempenho-cobranca/${empresaId}`, { params: { data_inicio: dataInicio, data_fim: dataFim } })
    .then((res) => res.data);
}
