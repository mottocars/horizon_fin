import http from './http';

// Detalhamento de um valor da aba DFC: o que compõe a célula conta × mês (Realizado ou Projetado).
// `natureza`: conta do plano ou 'sem'; `centros`: lista de centros que somam na célula ('sem' = sem
// centro de custo). Devolve { tipo, mes, lado, conta, total, versao?, grupos: [{ titulo, subtitulo,
// valor, avisos, blocos }] } — ver backend dfc-detalhamento.
export function getDetalhamentoDfc(empresaId, { tipo, mes, lado, natureza, centros }) {
  return http
    .get(`/dfc-detalhamento/${empresaId}`, { params: { tipo, mes, lado, natureza, centros: centros.join(',') } })
    .then((res) => res.data);
}
