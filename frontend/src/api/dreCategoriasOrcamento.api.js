import http from './http';

export function listCategoriasOrcamento(empresaId) {
  return http.get(`/dre-categorias-orcamento/${empresaId}`).then((res) => res.data);
}

export function createCategoriaOrcamento(empresaId, { nome }) {
  return http.post(`/dre-categorias-orcamento/${empresaId}`, { nome }).then((res) => res.data);
}

export function removeCategoriaOrcamento(empresaId, id) {
  return http.delete(`/dre-categorias-orcamento/${empresaId}/${id}`).then((res) => res.data);
}
