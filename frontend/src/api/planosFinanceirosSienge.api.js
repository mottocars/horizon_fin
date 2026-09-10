import http from './http';

export function listPlanosGerados() {
  return http.get('/planos-financeiros/sienge').then((res) => res.data);
}

export function listContas(empresaId, { page = 1, limit = 15, search = '' } = {}) {
  return http
    .get(`/planos-financeiros/sienge/${empresaId}/contas`, { params: { page, limit, search } })
    .then((res) => res.data);
}

export function gerarPlano(empresaId, mascaraNiveis) {
  const body = { empresa_id: empresaId };
  if (mascaraNiveis) body.mascara_niveis = mascaraNiveis;
  return http.post('/planos-financeiros/sienge/gerar', body).then((res) => res.data);
}

export function getItem(empresaId, siengeId) {
  return http
    .get(`/planos-financeiros/sienge/${empresaId}/contas/${siengeId}`)
    .then((res) => res.data);
}

export function updateEnriquecimento(empresaId, siengeId, data) {
  return http
    .put(`/planos-financeiros/sienge/${empresaId}/contas/${siengeId}`, data)
    .then((res) => res.data);
}
