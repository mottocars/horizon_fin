import http from './http';

export function consultarCep(cep) {
  const digits = cep.replace(/\D/g, '');
  return http.get(`/cep/${digits}`).then((res) => res.data);
}
