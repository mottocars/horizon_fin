import http from './http';

export function listExtratoEmpreendimentos(empresaId) {
  return http.get(`/extrato/${empresaId}`).then((res) => res.data);
}

export function importarExtrato(empresaId, file) {
  const formData = new FormData();
  formData.append('arquivo', file);
  return http
    .post(`/extrato/${empresaId}/importar`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data);
}

export function baixarExtrato(empresaId, contratoEmpreendimento) {
  return http
    .get(`/extrato/${empresaId}/${encodeURIComponent(contratoEmpreendimento)}/download`, {
      responseType: 'blob',
    })
    .then((res) => res.data);
}

export function exportarExtrato(empresaId, contratoEmpreendimento) {
  return http
    .get(`/extrato/${empresaId}/${encodeURIComponent(contratoEmpreendimento)}/exportar`, {
      responseType: 'blob',
    })
    .then((res) => res.data);
}

export function exportarExtratoTodos(empresaId) {
  return http.get(`/extrato/${empresaId}/exportar`, { responseType: 'blob' }).then((res) => res.data);
}

export function excluirExtrato(empresaId, contratoEmpreendimento) {
  return http
    .delete(`/extrato/${empresaId}/${encodeURIComponent(contratoEmpreendimento)}`)
    .then((res) => res.data);
}
