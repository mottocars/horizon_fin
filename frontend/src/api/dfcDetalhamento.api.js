import http from './http';

// Detalhamento de um valor da aba DFC: o que compõe a célula conta × mês (Realizado ou Projetado).
// `natureza`: conta do plano ou 'sem'; `centros`: lista de centros que somam na célula ('sem' = sem
// centro de custo). Devolve { tipo, mes, lado, conta, total, versao?, grupos: [{ titulo, subtitulo,
// valor, avisos, blocos }] } — ver backend dfc-detalhamento.
// `versao`: versão do Orçamento (filtro "Versão" da aba DFC); sem ela, a última.
// `tipoParcela`: linha de tipo de parcela (máscara por tipo de parcela); '' = SEM TIPO DE PARCELA. Sem ele
// (undefined), o detalhamento é o da conta inteira.
export function getDetalhamentoDfc(empresaId, { tipo, mes, lado, natureza, centros, versao = null, tipoParcela }) {
  const params = { tipo, mes, lado, natureza, centros: centros.join(',') };
  if (versao) params.versao = versao;
  if (tipoParcela !== undefined && tipoParcela !== null) params.tipo_parcela = tipoParcela;
  return http
    .get(`/dfc-detalhamento/${empresaId}`, { params })
    .then((res) => res.data);
}
