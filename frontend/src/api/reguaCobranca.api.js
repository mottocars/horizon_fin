import http from './http';

export function getResumoReguaCobranca(empresaId) {
  return http.get('/regua-cobranca/resumo', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

// Usuários elegíveis pra "Responsável": só quem tem esta empresa registrada
// no cadastro e não é Master (ver reguaCobranca.service.js::listResponsaveis) —
// não é o /usuarios genérico, que é escopado por quem está logado, não pela
// empresa da régua sendo configurada. `apenasAtribuidos` devolve só quem já
// é responsável por alguma etapa da régua (filtro da aba Rotinas).
export function listResponsaveisReguaCobranca(empresaId, { apenasAtribuidos = false } = {}) {
  const params = { empresa_id: empresaId };
  if (apenasAtribuidos) params.apenas_atribuidos = true;
  return http.get('/regua-cobranca/responsaveis', { params }).then((res) => res.data);
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

// "Data de hoje" da régua (sempre a real, fuso BR — ver
// reguaCobranca.service.js::getDataSistema).
export function getDataSistemaReguaCobranca(empresaId) {
  return http.get('/regua-cobranca/data-sistema', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

// "Tipo de Comunicação" (Configurações Globais) — 1 por empresa, ver
// reguaCobranca.service.js::getComunicacaoAutomatica. Devolve { tipo }:
// 'automatica' (Rotina só mostra o status), 'visualizar' (responsável abre
// a mensagem e clica Enviar) ou 'copiar' (responsável copia e envia pelo
// próprio WhatsApp).
export function getComunicacaoAutomaticaReguaCobranca(empresaId) {
  return http.get('/regua-cobranca/comunicacao-automatica', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function salvarComunicacaoAutomaticaReguaCobranca(empresaId, tipo) {
  return http
    .put('/regua-cobranca/comunicacao-automatica', { tipo }, { params: { empresa_id: empresaId } })
    .then((res) => res.data);
}

// "Tipos de Pagamentos para Cobrança" (Configurações Globais) — ver
// reguaCobranca.service.js::getTiposPagamento. Devolve { tipos: [{ descricao,
// parcelas, abertas }], selecionados: [descricao] }; salvar recebe o lado
// direito inteiro e devolve o mesmo formato.
export function getTiposPagamentoReguaCobranca(empresaId) {
  return http.get('/regua-cobranca/tipos-pagamento', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function salvarTiposPagamentoReguaCobranca(empresaId, descricoes) {
  return http
    .put('/regua-cobranca/tipos-pagamento', { descricoes }, { params: { empresa_id: empresaId } })
    .then((res) => res.data);
}

// ─── Distribuição da Rotina (Configurações Globais) ────────────────────────
// Ver regua-cobranca/distribuicao.service.js. Toda escrita devolve o painel
// inteiro atualizado (mesmo formato de getDistribuicaoReguaCobranca).

export function getConfigDistribuicaoReguaCobranca(empresaId) {
  return http.get('/regua-cobranca/distribuicao/config', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function getDistribuicaoReguaCobranca(empresaId) {
  return http.get('/regua-cobranca/distribuicao', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function salvarConfigDistribuicaoReguaCobranca(empresaId, dados) {
  return http.put('/regua-cobranca/distribuicao/config', dados, { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function adicionarAtendenteDistribuicao(empresaId, usuarioId) {
  return http
    .post('/regua-cobranca/distribuicao/participantes', { usuario_id: usuarioId }, { params: { empresa_id: empresaId } })
    .then((res) => res.data);
}

export function removerAtendenteDistribuicao(empresaId, usuarioId) {
  return http
    .delete(`/regua-cobranca/distribuicao/participantes/${usuarioId}`, { params: { empresa_id: empresaId } })
    .then((res) => res.data);
}

// `ate` = 'YYYY-MM-DD' (último dia fora, inclusive) ou null pra retomar.
export function pausarAtendenteDistribuicao(empresaId, usuarioId, ate) {
  return http
    .put(`/regua-cobranca/distribuicao/participantes/${usuarioId}/pausa`, { ate }, { params: { empresa_id: empresaId } })
    .then((res) => res.data);
}

export function substituirAtendenteDistribuicao(empresaId, usuarioId, paraUsuarioId) {
  return http
    .post(
      `/regua-cobranca/distribuicao/participantes/${usuarioId}/substituir`,
      { para_usuario_id: paraUsuarioId },
      { params: { empresa_id: empresaId } }
    )
    .then((res) => res.data);
}

// redistribuir=false: "Distribuir agora" (só quem ainda não tem dono hoje);
// redistribuir=true: "Redistribuir hoje" (refaz o dia; `equilibrar` repassa
// parte das carteiras maiores pras menores). A resposta traz `resultado`.
export function distribuirHojeReguaCobranca(empresaId, { redistribuir = false, equilibrar = false } = {}) {
  return http
    .post('/regua-cobranca/distribuicao/distribuir', { redistribuir, equilibrar }, { params: { empresa_id: empresaId } })
    .then((res) => res.data);
}
