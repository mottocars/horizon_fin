import http from './http';

export function listEprEmpreendimentos(empresaId) {
  return http.get(`/epr/${empresaId}`).then((res) => res.data);
}

export function importarEpr(empresaId, file) {
  const formData = new FormData();
  formData.append('arquivo', file);
  return http
    .post(`/epr/${empresaId}/importar`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data);
}

export function baixarEpr(empresaId, contratoMestreObra) {
  return http
    .get(`/epr/${empresaId}/${encodeURIComponent(contratoMestreObra)}/download`, {
      responseType: 'blob',
    })
    .then((res) => res.data);
}

export function exportarEpr(empresaId, contratoMestreObra) {
  return http
    .get(`/epr/${empresaId}/${encodeURIComponent(contratoMestreObra)}/exportar`, {
      responseType: 'blob',
    })
    .then((res) => res.data);
}

export function exportarEprTodos(empresaId) {
  return http
    .get(`/epr/${empresaId}/exportar`, { responseType: 'blob' })
    .then((res) => res.data);
}

export function excluirEpr(empresaId, contratoMestreObra) {
  return http
    .delete(`/epr/${empresaId}/${encodeURIComponent(contratoMestreObra)}`)
    .then((res) => res.data);
}
