import http from './http';

export function listContasGerados() {
  return http.get('/contas-bancarias/sienge').then((res) => res.data);
}

export function listContas(empresaId, { page = 1, limit = 15, search = '', status = [], companyIds = [] } = {}) {
  return http
    .get(`/contas-bancarias/sienge/${empresaId}/contas`, {
      params: {
        page,
        limit,
        search,
        status: status.length ? status.join(',') : undefined,
        company_id: companyIds.length ? companyIds.join(',') : undefined,
      },
    })
    .then((res) => res.data);
}

export function listBancos() {
  return http.get('/contas-bancarias/sienge/bancos').then((res) => res.data);
}

export function gerarContasBancarias(empresaId) {
  return http
    .post('/contas-bancarias/sienge/gerar', { empresa_id: empresaId })
    .then((res) => res.data);
}

export function getItem(empresaId, companyId, numeroConta) {
  return http
    .get(`/contas-bancarias/sienge/${empresaId}/contas/${companyId}/${encodeURIComponent(numeroConta)}`)
    .then((res) => res.data);
}

export function updateEnriquecimento(empresaId, companyId, numeroConta, data) {
  return http
    .put(
      `/contas-bancarias/sienge/${empresaId}/contas/${companyId}/${encodeURIComponent(numeroConta)}`,
      data
    )
    .then((res) => res.data);
}
