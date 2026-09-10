import http from './http';

export function listCertificados(empresaId) {
  return http.get(`/certificados/${empresaId}`).then((res) => res.data);
}

export function criarCertificado(empresaId, { senha, arquivo }) {
  const formData = new FormData();
  formData.append('senha', senha);
  formData.append('arquivo', arquivo);
  return http
    .post(`/certificados/${empresaId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data);
}

export function substituirCertificado(id, { senha, arquivo }) {
  const formData = new FormData();
  formData.append('senha', senha);
  formData.append('arquivo', arquivo);
  return http
    .put(`/certificados/${id}/substituir`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data);
}

