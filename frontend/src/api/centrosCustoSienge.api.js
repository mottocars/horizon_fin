import http from './http';

export function listCentrosGerados() {
  return http.get('/centros-custo/sienge').then((res) => res.data);
}

export function listItens(empresaId, { page = 1, limit = 15, search = '' } = {}) {
  return http
    .get(`/centros-custo/sienge/${empresaId}/itens`, { params: { page, limit, search } })
    .then((res) => res.data);
}

export function gerarCentrosCusto(empresaId) {
  return http
    .post('/centros-custo/sienge/gerar', { empresa_id: empresaId })
    .then((res) => res.data);
}

export function exportarCentrosCusto(empresaId) {
  return http
    .get(`/centros-custo/sienge/${empresaId}/export`, { responseType: 'blob' })
    .then((res) => res.data);
}

export function getItem(empresaId, siengeId) {
  return http.get(`/centros-custo/sienge/${empresaId}/itens/${siengeId}`).then((res) => res.data);
}

export function updateEnriquecimento(empresaId, siengeId, data) {
  return http
    .put(`/centros-custo/sienge/${empresaId}/itens/${siengeId}`, data)
    .then((res) => res.data);
}

export function listEtapas(empresaId, siengeId) {
  return http
    .get(`/centros-custo/sienge/${empresaId}/itens/${siengeId}/etapas`)
    .then((res) => res.data);
}

export function createEtapa(empresaId, siengeId, data) {
  return http
    .post(`/centros-custo/sienge/${empresaId}/itens/${siengeId}/etapas`, data)
    .then((res) => res.data);
}

export function updateEtapa(empresaId, siengeId, etapaId, data) {
  return http
    .put(`/centros-custo/sienge/${empresaId}/itens/${siengeId}/etapas/${etapaId}`, data)
    .then((res) => res.data);
}

export function deleteEtapa(empresaId, siengeId, etapaId) {
  return http
    .delete(`/centros-custo/sienge/${empresaId}/itens/${siengeId}/etapas/${etapaId}`)
    .then((res) => res.data);
}
