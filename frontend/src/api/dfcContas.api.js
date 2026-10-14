import http from './http';

// Contas bancárias da empresa (Sienge, v1/checking-accounts) com o "Projeta DFC".
export function listContasCorrentesDfc(empresaId) {
  return http.get(`/dfc-contas/${empresaId}`).then((res) => res.data);
}

export function updateContaCorrenteDfc(empresaId, companyId, numeroConta, { projeta_dfc }) {
  return http
    .put(`/dfc-contas/${empresaId}/${companyId}/${encodeURIComponent(numeroConta)}`, { projeta_dfc })
    .then((res) => res.data);
}

// Busca as contas no Sienge (mesma rotina da tela Saldo de Contas Bancárias): { total_importado }.
export function sincronizarContasCorrentesDfc(empresaId) {
  return http.post(`/dfc-contas/${empresaId}/sincronizar`).then((res) => res.data);
}
