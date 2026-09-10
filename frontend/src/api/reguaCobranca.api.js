import http from './http';

export function getResumoReguaCobranca(empresaId) {
  return http.get('/regua-cobranca/resumo', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

// Usuários elegíveis pra "Responsável": só quem tem esta empresa registrada
// no cadastro e não é Master (ver reguaCobranca.service.js::listResponsaveis) —
// não é o /usuarios genérico, que é escopado por quem está logado, não pela
// empresa da régua sendo configurada.
export function listResponsaveisReguaCobranca(empresaId) {
  return http.get('/regua-cobranca/responsaveis', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function listEtapasReguaCobranca(empresaId, cluster) {
  return http.get('/regua-cobranca/etapas', { params: { empresa_id: empresaId, cluster } }).then((res) => res.data);
}

export function criarEtapaReguaCobranca(empresaId, cluster, dados = {}) {
  return http.post('/regua-cobranca/etapas', { empresa_id: empresaId, cluster, ...dados }).then((res) => res.data);
}

export function atualizarEtapaReguaCobranca(id, dados) {
  return http.put(`/regua-cobranca/etapas/${id}`, dados).then((res) => res.data);
}

export function removerEtapaReguaCobranca(id) {
  return http.delete(`/regua-cobranca/etapas/${id}`).then((res) => res.data);
}

// Parâmetros de disparo diário (horário + conexões Z-API/Email) — 1 por
// empresa + cluster (ver reguaCobranca.service.js::listParametrosDisparo/
// salvarParametroDisparo). Usado só pela Configurações Globais, não mais
// por cluster (ver ConfiguracoesGlobaisPainel.jsx).
export function listParametrosDisparoReguaCobranca(empresaId) {
  return http.get('/regua-cobranca/parametros-disparo', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function salvarParametroDisparoReguaCobranca(empresaId, cluster, dados) {
  return http
    .put('/regua-cobranca/parametros-disparo', dados, { params: { empresa_id: empresaId, cluster } })
    .then((res) => res.data);
}

// Parametrização da "data de hoje" usada pelos disparos (fuso BR ou uma
// data fictícia pra testes) — 1 por empresa, ver
// reguaCobranca.service.js::getDataSistema/salvarDataSistema.
export function getDataSistemaReguaCobranca(empresaId) {
  return http.get('/regua-cobranca/data-sistema', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function salvarDataSistemaReguaCobranca(empresaId, dados) {
  return http.put('/regua-cobranca/data-sistema', dados, { params: { empresa_id: empresaId } }).then((res) => res.data);
}

// Flag "Ativar Comunicação Automática" (Configurações Globais) — 1 por
// empresa, ver reguaCobranca.service.js::getComunicacaoAutomatica/
// salvarComunicacaoAutomatica. Ligada = WhatsApp/E-mail na Rotina do dia
// são só status de leitura (esperando o disparo automático). Desligada
// (padrão, hoje ainda sem disparo de verdade) = viram checkbox manual do
// responsável, igual à Ligação.
export function getComunicacaoAutomaticaReguaCobranca(empresaId) {
  return http.get('/regua-cobranca/comunicacao-automatica', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function salvarComunicacaoAutomaticaReguaCobranca(empresaId, ativa) {
  return http
    .put('/regua-cobranca/comunicacao-automatica', { ativa }, { params: { empresa_id: empresaId } })
    .then((res) => res.data);
}
