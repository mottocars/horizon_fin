const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../../../config/db');
const env = require('../../../config/env');
const T = require('../../../config/telas');

// Servidor de autorização OAuth 2.1 do MCP do DFC Construtoras (pedido do usuário: o conector do
// Claude só funciona depois de entrar com o usuário do Horizon Fin, e o login expira).
// - Registro dinâmico de cliente (RFC 7591): o Claude se registra sozinho;
// - Código de autorização com PKCE S256 (uso único, 5 minutos);
// - Token de acesso de 1 hora, renovável pelo token de renovação ATÉ o fim da sessão — login +
//   `sessao_horas` do conector. Depois disso, nada renova: o Claude pede o login de novo.
// Tokens só como hash SHA-256 no banco. Relógio da aplicação (o do Postgres da VPS é deslocado).

const ACCESS_SEGUNDOS = 60 * 60;
const CODIGO_SEGUNDOS = 5 * 60;

const aleatorio = () => crypto.randomBytes(32).toString('base64url');
const hash = (v) => crypto.createHash('sha256').update(v).digest('hex');
const agora = () => new Date();
const depois = (segundos, base = agora()) => new Date(base.getTime() + segundos * 1000);

function erroOAuth(error, descricao, status = 400) {
  const e = new Error(descricao);
  e.oauth = { error, error_description: descricao };
  e.status = status;
  return e;
}

// URLs públicas (a mesma base do link do conector, MCP_PUBLIC_BASE_URL).
const base = () => env.mcp.publicBaseUrl.replace(/\/+$/, '');
const urls = () => ({
  issuer: base(),
  authorize: `${base()}/api/mcp-oauth/authorize`,
  token: `${base()}/api/mcp-oauth/token`,
  register: `${base()}/api/mcp-oauth/register`,
});
const urlRecurso = (token) => `${base()}/api/mcp/dfc/${token}`;
const urlMetadadosRecurso = (token) => `${base()}/.well-known/oauth-protected-resource/api/mcp/dfc/${token}`;

function metadadosServidor() {
  const u = urls();
  return {
    issuer: u.issuer,
    authorization_endpoint: u.authorize,
    token_endpoint: u.token,
    registration_endpoint: u.register,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['dfc'],
    service_documentation: `${base()}/integracoes/mcp`,
  };
}

function metadadosRecurso(token) {
  return {
    resource: urlRecurso(token),
    authorization_servers: [urls().issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: ['dfc'],
    resource_name: 'Horizon Fin — DFC Construtoras',
  };
}

// ─── Registro dinâmico de cliente ──────────────────────────────────────────────────────────────
function redirectValido(uri) {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname));
  } catch {
    return false;
  }
}

async function registrarCliente({ redirect_uris: redirects, client_name: nome }) {
  if (!Array.isArray(redirects) || !redirects.length || redirects.length > 10 || !redirects.every((r) => typeof r === 'string' && redirectValido(r))) {
    throw erroOAuth('invalid_redirect_uri', 'redirect_uris precisa ter de 1 a 10 URLs https (ou http://localhost).');
  }
  const clientId = `hz_${crypto.randomBytes(16).toString('hex')}`;
  const criadoEm = agora();
  await pool.query('INSERT INTO mcp_oauth_clientes (client_id, client_name, redirect_uris, criado_em) VALUES ($1, $2, $3, $4)', [
    clientId,
    String(nome || '').slice(0, 200) || null,
    JSON.stringify(redirects),
    criadoEm,
  ]);
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(criadoEm.getTime() / 1000),
    client_name: nome || undefined,
    redirect_uris: redirects,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
}

async function cliente(clientId) {
  const { rows } = await pool.query('SELECT client_id, client_name, redirect_uris FROM mcp_oauth_clientes WHERE client_id = $1', [clientId]);
  return rows[0] || null;
}

// ─── Conector e usuário ─────────────────────────────────────────────────────────────────────────
// Conector DFC ativo pelo token do link (o `resource` que o Claude manda no /authorize termina nele).
async function conectorPorToken(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT m.id, m.empresa_id, m.nome_conector, m.sessao_horas, m.ativo, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa
       FROM integracoes_mcp m JOIN empresas e ON e.id = m.empresa_id
      WHERE m.token_hash = $1 AND m.escopo = 'DFC_CONSTRUTORAS'`,
    [hash(token)]
  );
  const c = rows[0];
  return c && c.ativo ? c : null;
}

const tokenDoRecurso = (resource) => {
  const m = /\/api\/mcp\/dfc\/([A-Za-z0-9]+)\/?$/.exec(String(resource || ''));
  return m ? m[1] : null;
};

// O usuário pode usar o conector? Ativo, com a tela do DFC e acesso à empresa do conector.
async function usuarioPodeUsar(usuarioId, conector) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nome, u.ativo, u.permissao, u.telas_permitidas,
            EXISTS (SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = u.id AND ue.empresa_id = $2) AS tem_empresa
       FROM usuarios u WHERE u.id = $1`,
    [usuarioId, conector.empresa_id]
  );
  const u = rows[0];
  if (!u || !u.ativo) return null;
  if (u.permissao === 'MASTER') return u;
  return u.tem_empresa && (u.telas_permitidas || []).includes(T.DFC) ? u : null;
}

// Login (mesma regra de auth.service: usuário + senha). Mensagem genérica em qualquer falha.
async function autenticar(username, senha, conector) {
  const { rows } = await pool.query('SELECT id, senha_hash, ativo FROM usuarios WHERE username = $1', [String(username || '').trim()]);
  const u = rows[0];
  const ok = u && u.ativo && (await bcrypt.compare(String(senha || ''), u.senha_hash));
  if (!ok) throw erroOAuth('access_denied', 'Usuário ou senha inválidos.', 401);
  const permitido = await usuarioPodeUsar(u.id, conector);
  if (!permitido) throw erroOAuth('access_denied', 'Seu usuário não tem acesso ao DFC Construtoras desta empresa.', 403);
  return permitido;
}

// ─── Código de autorização ──────────────────────────────────────────────────────────────────────
async function criarCodigo({ clientId, conectorId, usuarioId, redirectUri, codeChallenge }) {
  const code = aleatorio();
  await pool.query(
    `INSERT INTO mcp_oauth_codigos (code_hash, client_id, conector_id, usuario_id, redirect_uri, code_challenge, expira_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [hash(code), clientId, conectorId, usuarioId, redirectUri, codeChallenge, depois(CODIGO_SEGUNDOS)]
  );
  return code;
}

async function novaSessao(client, { conectorId, usuarioId, clientId, sessaoExpiraEm }) {
  const access = aleatorio();
  const refresh = aleatorio();
  const accessExpira = new Date(Math.min(depois(ACCESS_SEGUNDOS).getTime(), sessaoExpiraEm.getTime()));
  await client.query(
    `INSERT INTO mcp_oauth_sessoes (conector_id, usuario_id, client_id, access_hash, refresh_hash, access_expira_em, sessao_expira_em, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [conectorId, usuarioId, clientId, hash(access), hash(refresh), accessExpira, sessaoExpiraEm, agora()]
  );
  return resposta(access, refresh, accessExpira);
}

function resposta(access, refresh, accessExpira) {
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: Math.max(1, Math.floor((accessExpira.getTime() - Date.now()) / 1000)),
    refresh_token: refresh,
    scope: 'dfc',
  };
}

// grant_type=authorization_code
async function trocarCodigo({ code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier }) {
  if (!code || !clientId || !verifier) throw erroOAuth('invalid_request', 'code, client_id e code_verifier são obrigatórios.');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows } = await db.query('SELECT * FROM mcp_oauth_codigos WHERE code_hash = $1 FOR UPDATE', [hash(code)]);
    const c = rows[0];
    if (!c || c.usado_em || new Date(c.expira_em) < agora()) throw erroOAuth('invalid_grant', 'Código inválido, expirado ou já usado.');
    if (c.client_id !== clientId) throw erroOAuth('invalid_grant', 'O código não é deste cliente.');
    if (redirectUri && redirectUri !== c.redirect_uri) throw erroOAuth('invalid_grant', 'redirect_uri diferente do usado na autorização.');
    const desafio = crypto.createHash('sha256').update(verifier).digest('base64url');
    if (desafio !== c.code_challenge) throw erroOAuth('invalid_grant', 'code_verifier não confere (PKCE).');
    await db.query('UPDATE mcp_oauth_codigos SET usado_em = $2 WHERE code_hash = $1', [hash(code), agora()]);
    const { rows: con } = await db.query('SELECT sessao_horas FROM integracoes_mcp WHERE id = $1', [c.conector_id]);
    const sessaoExpiraEm = depois((con[0]?.sessao_horas || 24) * 3600);
    const r = await novaSessao(db, { conectorId: c.conector_id, usuarioId: c.usuario_id, clientId, sessaoExpiraEm });
    await db.query('COMMIT');
    return r;
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}

// grant_type=refresh_token — gira os dois tokens; a sessão continua com o mesmo fim.
async function renovar({ refresh_token: refresh, client_id: clientId }) {
  if (!refresh) throw erroOAuth('invalid_request', 'refresh_token é obrigatório.');
  const { rows } = await pool.query('SELECT * FROM mcp_oauth_sessoes WHERE refresh_hash = $1', [hash(refresh)]);
  const s = rows[0];
  if (!s || s.revogada_em) throw erroOAuth('invalid_grant', 'Sessão encerrada. Entre novamente.');
  if (clientId && clientId !== s.client_id) throw erroOAuth('invalid_grant', 'O token não é deste cliente.');
  const fim = new Date(s.sessao_expira_em);
  if (fim <= agora()) throw erroOAuth('invalid_grant', 'O login expirou. Entre novamente.');
  const access = aleatorio();
  const novoRefresh = aleatorio();
  const accessExpira = new Date(Math.min(depois(ACCESS_SEGUNDOS).getTime(), fim.getTime()));
  const { rowCount } = await pool.query(
    `UPDATE mcp_oauth_sessoes SET access_hash = $2, refresh_hash = $3, access_expira_em = $4
      WHERE id = $1 AND refresh_hash = $5 AND revogada_em IS NULL`,
    [s.id, hash(access), hash(novoRefresh), accessExpira, hash(refresh)]
  );
  if (!rowCount) throw erroOAuth('invalid_grant', 'Sessão encerrada. Entre novamente.');
  return resposta(access, novoRefresh, accessExpira);
}

// Chamada MCP: o Bearer vale pra este conector, não expirou e o usuário ainda pode usar o DFC?
async function validarAcesso(accessToken, conector) {
  if (!accessToken) return null;
  const { rows } = await pool.query(
    `SELECT id, usuario_id, access_expira_em, sessao_expira_em, revogada_em FROM mcp_oauth_sessoes
      WHERE access_hash = $1 AND conector_id = $2`,
    [hash(accessToken), conector.id]
  );
  const s = rows[0];
  const t = agora();
  if (!s || s.revogada_em || new Date(s.access_expira_em) <= t || new Date(s.sessao_expira_em) <= t) return null;
  const usuario = await usuarioPodeUsar(s.usuario_id, conector);
  if (!usuario) return null;
  pool.query('UPDATE mcp_oauth_sessoes SET ultimo_uso_em = $2 WHERE id = $1', [s.id, t]).catch(() => {});
  return { sessaoId: s.id, usuario };
}

// Tela de Integrações > MCP: sessões ativas e "Encerrar sessões".
async function sessoesAtivas(conectorId) {
  const { rows } = await pool.query(
    `SELECT s.id, u.nome AS usuario, s.criado_em, s.ultimo_uso_em, s.sessao_expira_em
       FROM mcp_oauth_sessoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.conector_id = $1 AND s.revogada_em IS NULL AND s.sessao_expira_em > $2
      ORDER BY s.criado_em DESC`,
    [conectorId, agora()]
  );
  return rows;
}

async function encerrarSessoes(conectorId) {
  const { rowCount } = await pool.query(
    'UPDATE mcp_oauth_sessoes SET revogada_em = $2 WHERE conector_id = $1 AND revogada_em IS NULL',
    [conectorId, agora()]
  );
  return rowCount;
}

module.exports = {
  erroOAuth,
  urls,
  urlRecurso,
  urlMetadadosRecurso,
  metadadosServidor,
  metadadosRecurso,
  registrarCliente,
  cliente,
  conectorPorToken,
  tokenDoRecurso,
  autenticar,
  criarCodigo,
  trocarCodigo,
  renovar,
  validarAcesso,
  sessoesAtivas,
  encerrarSessoes,
};
