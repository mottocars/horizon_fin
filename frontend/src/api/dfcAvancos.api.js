import http from './http';

// Avanço acumulado mês a mês de cada obra (PLS do DCD e Prevision) entre `inicio` e `fim`
// ('AAAA-MM-DD'): { meses: ['AAAA-MM'...], obras: [{ sienge_id, name, contrato, codigo_prevision,
// ultimo_mes_liberado, pls: { 'AAAA-MM': % | null } | null, prevision: {...} | null }] }.
export function listAvancosDfc(empresaId, { inicio, fim }) {
  return http.get(`/dfc-avancos/${empresaId}`, { params: { inicio, fim } }).then((res) => res.data);
}
