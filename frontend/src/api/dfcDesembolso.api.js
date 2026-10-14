import http from './http';

// Prazo Desembolso das naturezas "SIENGE - EMPRESARIAL DESEMBOLSO" (cria as fichas que faltarem):
// [{ sienge_id, prazo_medio, prazo_mediano, titulos, calculado_em, sem_historico }].
export function listDesembolsoDfc(empresaId) {
  return http.get(`/dfc-desembolso/${empresaId}`).then((res) => res.data);
}

// Ficha guardada da natureza (calcula na hora se ainda não tiver).
export function getFichaDesembolsoDfc(empresaId, siengeId) {
  return http.get(`/dfc-desembolso/${empresaId}/${siengeId}`).then((res) => res.data);
}

// Recalcula a ficha com os títulos dos últimos 12 meses e guarda.
export function recalcularFichaDesembolsoDfc(empresaId, siengeId) {
  return http.post(`/dfc-desembolso/${empresaId}/${siengeId}/recalcular`).then((res) => res.data);
}
