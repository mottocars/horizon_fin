import http from './http';

// Tela favorita (estrela) do usuário num dashboard: { tela } (null = nenhuma).
export function getTelaFavorita(dashboard) {
  return http.get(`/dashboards/${dashboard}/favorita`).then((res) => res.data);
}

// Dados do painel do Fluxo de Caixa (Econômico Financeiro): { empresa_id, hist, hor, centros: '1,2' }.
export function getFluxoCaixaPainel(params) {
  return http.get('/dashboards/economico-financeiro/fluxo-caixa', { params }).then((res) => res.data);
}

// Dados do Aging List (Econômico Financeiro): parcelas em aberto a receber e a pagar e o saldo bancário de hoje.
export function getAgingPainel(params) {
  return http.get('/dashboards/economico-financeiro/aging', { params }).then((res) => res.data);
}

export function salvarTelaFavorita(dashboard, tela) {
  return http.put(`/dashboards/${dashboard}/favorita`, { tela }).then((res) => res.data);
}
