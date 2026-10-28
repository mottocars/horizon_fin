import http from './http';

// Chaves da API Horizon (tela Integrações > API Horizon). A chave em si só vem na resposta da criação.
export function listChavesApiHorizon() {
  return http.get('/integracoes/api-horizon/chaves').then((res) => res.data);
}

export function criarChaveApiHorizon(data) {
  return http.post('/integracoes/api-horizon/chaves', data).then((res) => res.data);
}

export function revogarChaveApiHorizon(id) {
  return http.post(`/integracoes/api-horizon/chaves/${id}/revogar`).then((res) => res.data);
}

export function listChamadasApiHorizon(id) {
  return http.get(`/integracoes/api-horizon/chaves/${id}/requisicoes`).then((res) => res.data);
}
