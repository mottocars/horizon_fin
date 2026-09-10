import http from './http';

export function listCentrosCurva(empresaId) {
  return http.get(`/curva-obras/${empresaId}/centros`).then((res) => res.data);
}

export function getCurvaObra(empresaId, siengeId) {
  return http.get(`/curva-obras/${empresaId}/${siengeId}`).then((res) => res.data);
}

export function salvarCalibragemManual(empresaId, siengeId, { ano, mes, avancoMes }) {
  return http
    .put(`/curva-obras/${empresaId}/${siengeId}/calibragem`, { ano, mes, avancoMes })
    .then((res) => res.data);
}
