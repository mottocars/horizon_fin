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

// Excel do Avanço das Obras com os filtros da tela ({ visao, de, ate, obras: [sienge_id...] }):
// { blob, nome } — Resumo (os cards), Avanços (empilhado: obra × curva × período) e Filtros.
export function exportarAvancoExcel(empresaId, { visao, de, ate, obras = [] }) {
  const params = new URLSearchParams();
  if (visao) params.set('visao', visao);
  if (de) params.set('de', de);
  if (ate) params.set('ate', ate);
  obras.forEach((o) => params.append('obra', o));
  return http.get(`/dfc-avancos/${empresaId}/curvas/excel`, { params, responseType: 'blob' }).then((res) => {
    const cabecalho = res.headers['content-disposition'] || '';
    const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cabecalho);
    return { blob: res.data, nome: utf8 ? decodeURIComponent(utf8[1]) : 'Avanço das Obras.xlsx' };
  });
}
