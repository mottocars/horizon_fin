import http from './http';

export function getResumoIncomeSienge(empresaId) {
  return http.get('/income-sienge/resumo', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function sincronizarIncomeSienge(empresaId) {
  return http.post('/income-sienge/sincronizar', { empresa_id: empresaId }).then((res) => res.data);
}
