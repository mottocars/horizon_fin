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

// Configuração do saldo (engrenagem da aba Contas): { tipo_saldo: 'ERP'|'HORIZON', soma_liberado, soma_cheque,
// soma_bloqueado, totalizador: { data, liberado, limite_cheque, bloqueado, valor } }.
export function getConfigSaldoDfc(empresaId) {
  return http.get(`/dfc-contas/${empresaId}/config-saldo`).then((res) => res.data);
}

export function salvarConfigSaldoDfc(empresaId, { tipo_saldo, soma_liberado, soma_cheque, soma_bloqueado }) {
  return http
    .put(`/dfc-contas/${empresaId}/config-saldo`, { tipo_saldo, soma_liberado, soma_cheque, soma_bloqueado })
    .then((res) => res.data);
}
