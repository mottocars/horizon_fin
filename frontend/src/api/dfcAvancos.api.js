import http from './http';

// Avanço acumulado mês a mês de cada obra entre `inicio` e `fim` ('AAAA-MM-DD'):
// { meses: ['AAAA-MM'...], mes_atual: 'AAAA-MM', obras: [{ sienge_id, name, contrato,
// codigo_prevision, ultimo_mes_liberado, pls: { 'AAAA-MM': % | null } | null, prevision: {...} | null,
// manual: { 'AAAA-MM': % } }] }.
export function listAvancosDfc(empresaId, { inicio, fim }) {
  return http.get(`/dfc-avancos/${empresaId}`, { params: { inicio, fim } }).then((res) => res.data);
}

// Grava (percentual número) ou apaga (null) o avanço acumulado manual da obra no mês 'AAAA-MM'.
export function salvarAvancoManualDfc(empresaId, siengeId, { mes, percentual }) {
  return http.put(`/dfc-avancos/${empresaId}/${siengeId}/manual`, { mes, percentual }).then((res) => res.data);
}
