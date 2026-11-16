import http from './http';

// DFC Construtoras › aba Dívida PJ — o valor da dívida PJ de cada centro de custo, mês a mês.

// O mês mais recente de cada centro: { [sienge_id]: { mes: 'AAAA-MM-01', valor } }.
export function listDividaPjVigentes(empresaId) {
  return http.get(`/dfc-divida-pj/${empresaId}/vigentes`).then((res) => res.data);
}

// Os meses de um centro, do mais antigo ao mais novo: [{ mes, valor }].
export function listDividaPjCentro(empresaId, siengeId) {
  return http.get(`/dfc-divida-pj/${empresaId}/${siengeId}`).then((res) => res.data);
}

// Cria ou atualiza o valor do mês; devolve a lista do centro já atualizada.
export function salvarDividaPj(empresaId, siengeId, { mes, valor }) {
  return http.put(`/dfc-divida-pj/${empresaId}/${siengeId}`, { mes, valor }).then((res) => res.data);
}

export function removerDividaPj(empresaId, siengeId, mes) {
  return http.delete(`/dfc-divida-pj/${empresaId}/${siengeId}/${mes}`).then((res) => res.data);
}
