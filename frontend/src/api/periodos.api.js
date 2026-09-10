import http from './http';

export function listPeriodos(empresaId) {
  const params = empresaId ? { empresaId } : {};
  return http.get('/periodos', { params }).then((res) => res.data);
}

export function createPeriodo(data) {
  return http.post('/periodos', data).then((res) => res.data);
}

export function updatePeriodo(id, data) {
  return http.put(`/periodos/${id}`, data).then((res) => res.data);
}

export function deletePeriodo(id) {
  return http.delete(`/periodos/${id}`).then((res) => res.data);
}
