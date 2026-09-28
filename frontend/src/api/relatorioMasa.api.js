import http from './http';

export function getMatrizEmpreendimentosMasa() {
  return http.get('/relatorios/empreendimentos-masa/matriz').then((res) => res.data);
}
