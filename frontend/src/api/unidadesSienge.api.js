import http from './http';

export function listUnidadesPorCentro(empresaId, siengeId) {
  return http.get(`/unidades/sienge/${empresaId}/${siengeId}`).then((res) => res.data);
}

export function gerarUnidades(empresaId) {
  return http.post('/unidades/sienge/gerar', { empresa_id: empresaId }).then((res) => res.data);
}

export function listCentrosComUnidades(empresaId) {
  return http.get(`/unidades/sienge/${empresaId}/centros`).then((res) => res.data);
}

export function updateValorUnidade(empresaId, siengeUnitId, valor) {
  return http
    .put(`/unidades/sienge/${empresaId}/unidade/${siengeUnitId}`, { valor })
    .then((res) => res.data);
}
