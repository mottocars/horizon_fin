import http from './http';

// Cadastros › Parceiros (aprovação dos aplicativos parceiros) e a Loja de aplicativos do topo.
// Ver backend/src/modules/parceiros. O pedido do parceiro chega pelo formulário público de
// api.horizonhub.com.br (api-docs/parceiros/).

// ─── cadastro ──
export function listarParceiros(status) {
  return http.get('/parceiros', { params: status ? { status } : {} }).then((res) => res.data);
}

export function obterParceiro(id) {
  return http.get(`/parceiros/${id}`).then((res) => res.data);
}

// A logo vem do banco por uma rota autenticada: baixa como blob (a <img> não manda o token sozinha).
export function baixarLogoParceiro(id, { loja = false } = {}) {
  return http.get(loja ? `/loja-aplicativos/${id}/logo` : `/parceiros/${id}/logo`, { responseType: 'blob' }).then((res) => res.data);
}

export function verificarParceiro(id) {
  return http.post(`/parceiros/${id}/verificar`).then((res) => res.data);
}

export function aprovarParceiro(id) {
  return http.post(`/parceiros/${id}/aprovar`).then((res) => res.data);
}

export function recusarParceiro(id, motivo) {
  return http.post(`/parceiros/${id}/recusar`, { motivo }).then((res) => res.data);
}

export function suspenderParceiro(id, motivo) {
  return http.post(`/parceiros/${id}/suspender`, { motivo }).then((res) => res.data);
}

export function reativarParceiro(id) {
  return http.post(`/parceiros/${id}/reativar`).then((res) => res.data);
}

// Permissões do navegador dentro do Horizon: { localizacao: true|false }.
export function definirPermissoesParceiro(id, permissoes) {
  return http.patch(`/parceiros/${id}/permissoes`, permissoes).then((res) => res.data);
}
export function novoSecretParceiro(id, revogarOficial) {
  return http.post(`/parceiros/${id}/novo-secret`, { revogar_oficial: revogarOficial }).then((res) => res.data);
}

// ─── Login com Horizon (página /oauth/authorize) ──
export function autorizarOidc(parametros) {
  return http.post('/oidc/autorizar', parametros).then((res) => res.data);
}

// ─── aplicativos instalados (menu lateral) e o aplicativo aberto dentro do Horizon ──
export function listarInstalados() {
  return http.get('/loja-aplicativos/instalados').then((res) => res.data);
}
export function instalarAplicativo(id) {
  return http.post(`/loja-aplicativos/${id}/instalar`).then((res) => res.data);
}
export function desinstalarAplicativo(id) {
  return http.delete(`/loja-aplicativos/${id}/instalar`).then((res) => res.data);
}
export function obterAplicativo(id) {
  return http.get(`/loja-aplicativos/${id}`).then((res) => res.data);
}

// ─── loja (todo usuário logado) ──
export function listarLojaAplicativos() {
  return http.get('/loja-aplicativos').then((res) => res.data);
}
