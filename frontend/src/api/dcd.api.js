import http from './http';

export function listDcdContratos(empresaId) {
  return http.get(`/dcd/${empresaId}`).then((res) => res.data);
}

export function importarDcd(empresaId, file) {
  const formData = new FormData();
  formData.append('arquivo', file);
  return http
    .post(`/dcd/${empresaId}/importar`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data);
}

export function baixarDcd(empresaId, numeroContrato) {
  return http
    .get(`/dcd/${empresaId}/${encodeURIComponent(numeroContrato)}/download`, {
      responseType: 'blob',
    })
    .then((res) => res.data);
}

export function exportarDcd(empresaId, numeroContrato) {
  return http
    .get(`/dcd/${empresaId}/${encodeURIComponent(numeroContrato)}/exportar`, {
      responseType: 'blob',
    })
    .then((res) => res.data);
}

export function exportarDcdTodos(empresaId) {
  return http.get(`/dcd/${empresaId}/exportar`, { responseType: 'blob' }).then((res) => res.data);
}

export function excluirDcd(empresaId, numeroContrato) {
  return http.delete(`/dcd/${empresaId}/${encodeURIComponent(numeroContrato)}`).then((res) => res.data);
}
