import http from './http';

// Tela Integrações > API Horizon. Cada usuário tem uma chave; a chave em si só vem na resposta
// da geração.
export function getMinhaChave() {
  return http.get('/integracoes/api-horizon/minha').then((res) => res.data);
}

export function gerarMinhaChave(data) {
  return http.post('/integracoes/api-horizon/minha', data).then((res) => res.data);
}

export function alterarAcessosMinhaChave(data) {
  return http.put('/integracoes/api-horizon/minha/acessos', data).then((res) => res.data);
}

export function revogarMinhaChave() {
  return http.post('/integracoes/api-horizon/minha/revogar').then((res) => res.data);
}

export function listMinhasChamadas() {
  return http.get('/integracoes/api-horizon/minha/requisicoes').then((res) => res.data);
}

// Master: chaves de todos os usuários.
export function listChavesUsuarios() {
  return http.get('/integracoes/api-horizon/chaves').then((res) => res.data);
}

export function revogarChaveUsuario(id) {
  return http.post(`/integracoes/api-horizon/chaves/${id}/revogar`).then((res) => res.data);
}

export function listChamadasChave(id) {
  return http.get(`/integracoes/api-horizon/chaves/${id}/requisicoes`).then((res) => res.data);
}
