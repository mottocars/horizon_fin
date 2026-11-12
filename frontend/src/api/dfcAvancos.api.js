import http from './http';

// Avanço acumulado mês a mês de cada obra entre `inicio` e `fim` ('AAAA-MM-DD'):
// { meses: ['AAAA-MM'...], mes_atual: 'AAAA-MM', obras: [{ sienge_id, name, contrato,
// codigo_prevision, ultimo_mes_liberado, pls: { 'AAAA-MM': % | null } | null, prevision: {...} | null,
// manual: { 'AAAA-MM': % } }] }. `todasObras`: também as obras sem "Projeta DFC" (Curva de avanço do Obra 360º).
export function listAvancosDfc(empresaId, { inicio, fim, todasObras = false }) {
  const params = todasObras ? { inicio, fim, obras: 'todas' } : { inicio, fim };
  return http.get(`/dfc-avancos/${empresaId}`, { params }).then((res) => res.data);
}

// Grava (percentual número) ou apaga (null) o avanço acumulado manual da obra no mês 'AAAA-MM'.
export function salvarAvancoManualDfc(empresaId, siengeId, { mes, percentual }) {
  return http.put(`/dfc-avancos/${empresaId}/${siengeId}/manual`, { mes, percentual }).then((res) => res.data);
}

// Curvas por data de cada obra (Obra 360º › Avanço das Obras — visões Mensal, Semanal e Diária):
// { hoje: 'AAAA-MM-DD', obras: [{ sienge_id, name, apelido, contrato,
//   pls: { ultima_liberacao, pontos: [['AAAA-MM-DD', %]...] } | null,
//   primaria | secundaria: { previsto: [[data, %]...], realizado: [[data, %]...] | null } | null }] }.
// Cada curva só traz os dias em que o valor muda (vale até o próximo ponto).
export function listCurvasAvanco(empresaId) {
  return http.get(`/dfc-avancos/${empresaId}/curvas`).then((res) => res.data);
}
