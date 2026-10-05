import http from './http';

// Relatório Extratos Bancários — busca na hora no banco (nada é armazenado). Pode levar alguns
// segundos com muitas contas/dias, por isso o timeout maior.
export function gerarExtratosBancarios({ empresaId, conexaoIds, dataInicio, dataFim }) {
  return http
    .get('/relatorios/extratos-bancarios', {
      params: { empresaId, conexaoIds: conexaoIds?.length ? conexaoIds.join(',') : undefined, dataInicio, dataFim },
      timeout: 180000,
    })
    .then((res) => res.data);
}
