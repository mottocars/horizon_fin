import http from './http';

export function getMatrizRepassesCef(empresaId) {
  return http.get(`/relatorios/repasses-cef/${empresaId}/matriz`).then((res) => res.data);
}
