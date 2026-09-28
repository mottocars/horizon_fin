import http from './http';

export function listFasesEmpreendimentosMasa() {
  return http.get('/relatorios/empreendimentos-masa/fases').then((res) => res.data);
}

export function listEmpreendimentosMasa() {
  return http.get('/relatorios/empreendimentos-masa/empreendimentos').then((res) => res.data);
}
