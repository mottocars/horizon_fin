import http from './http';

export function listAcervoNotas({ empresaId, mesInicio, mesFim }) {
  return http
    .get('/relatorios/notas-pendentes', { params: { empresaId, mesInicio, mesFim } })
    .then((res) => res.data);
}
