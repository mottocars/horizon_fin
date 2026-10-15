import http from './http';

// Tela favorita (estrela) do usuário num dashboard: { tela } (null = nenhuma).
export function getTelaFavorita(dashboard) {
  return http.get(`/dashboards/${dashboard}/favorita`).then((res) => res.data);
}

export function salvarTelaFavorita(dashboard, tela) {
  return http.put(`/dashboards/${dashboard}/favorita`, { tela }).then((res) => res.data);
}
