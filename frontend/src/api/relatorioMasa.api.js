import http from './http';

export function listFasesEmpreendimentosMasa() {
  return http.get('/relatorios/empreendimentos-masa/fases').then((res) => res.data);
}
