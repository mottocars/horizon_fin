import http from './http';

export function consultarCnpj(cnpj) {
  const digits = cnpj.replace(/\D/g, '');
  return http.get(`/empresas/consulta-cnpj/${digits}`).then((res) => res.data);
}

export function listEmpresas({ page = 1, limit = 10, search = '', ativo, empresaId } = {}) {
  const params = { page, limit, search };
  if (ativo !== undefined) params.ativo = ativo;
  if (empresaId) params.empresaId = empresaId;
  return http.get('/empresas', { params }).then((res) => res.data);
}

export function getEmpresa(id) {
  return http.get(`/empresas/${id}`).then((res) => res.data);
}

export function createEmpresa(data) {
  return http.post('/empresas', data).then((res) => res.data);
}

export function updateEmpresa(id, data) {
  return http.put(`/empresas/${id}`, data).then((res) => res.data);
}

export function setEmpresaStatus(id, ativo) {
  return http.patch(`/empresas/${id}/status`, { ativo }).then((res) => res.data);
}

export function deleteEmpresa(id) {
  return http.delete(`/empresas/${id}`).then((res) => res.data);
}
