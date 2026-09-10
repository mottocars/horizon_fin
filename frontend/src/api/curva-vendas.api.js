import http from './http';

export function listCentrosCurvaVendas(empresaId) {
  return http.get(`/curva-vendas/${empresaId}/centros`).then((res) => res.data);
}

export function getCurvaVendas(empresaId, siengeId) {
  return http.get(`/curva-vendas/${empresaId}/${siengeId}`).then((res) => res.data);
}

export function salvarPrevistoVendas(empresaId, siengeId, { ano, mes, valorPrevisto }) {
  return http
    .put(`/curva-vendas/${empresaId}/${siengeId}/previsto`, { ano, mes, valorPrevisto })
    .then((res) => res.data);
}

export function listUnidadesDisponiveisCurvaVendas(empresaId, siengeId, ano, mes) {
  return http
    .get(`/curva-vendas/${empresaId}/${siengeId}/unidades-disponiveis`, { params: { ano, mes } })
    .then((res) => res.data);
}

export function listUnidadesVendidasNoMes(empresaId, siengeId, ano, mes) {
  return http
    .get(`/curva-vendas/${empresaId}/${siengeId}/unidades-vendidas`, { params: { ano, mes } })
    .then((res) => res.data);
}

export function salvarPrevistoPorUnidades(empresaId, siengeId, { ano, mes, unitIds }) {
  return http
    .put(`/curva-vendas/${empresaId}/${siengeId}/previsto/unidades`, { ano, mes, unitIds })
    .then((res) => res.data);
}
