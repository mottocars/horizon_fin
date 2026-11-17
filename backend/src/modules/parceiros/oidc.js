const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../../config/db');
const env = require('../../config/env');
const { encrypt, decrypt } = require('../../utils/crypto');
const { PREFIXO_CLIENT_ID, PREFIXO_SECRET_OFICIAL, hashSegredo } = require('./comum');

// Login com Horizon (OpenID Connect) para os aplicativos parceiros da loja.
//
// O Horizon só confirma QUEM é o usuário; o login, as permissões e o vínculo com a conta do
// usuário no sistema do parceiro ficam todos com o parceiro. Fluxo (Authorization Code):
//   1. O aplicativo instalado (ícone no menu lateral) abre dentro do Horizon (iframe em
//      /aplicativos/:id) a URL de abertura do parceiro com ?iss=<issuer> ("login iniciado por
//      terceiro", OIDC Core §4) — na primeira vez, depois do botão Conectar.
//   2. O parceiro manda o navegador para o authorization_endpoint — a página /oauth/authorize do
//      frontend (o login do Horizon fica no navegador, não em cookie). Ela chama
//      POST /api/oidc/autorizar (autorizar abaixo) e devolve o usuário à URL de callback
//      cadastrada com ?code=…&state=…&iss=…, sem tela nenhuma.
//   3. O servidor do parceiro troca o code em POST /v1/oauth/token (client_id + client_secret
//      oficial) e recebe o id_token (RS256) com o sub — fixo por usuário e por parceiro.
//   4. sub desconhecido → o parceiro mostra o login dele e grava o vínculo; conhecido → entra direto.
// Documentação para o parceiro: api-docs (grupo "Login com Horizon").

const CODIGO_SEGUNDOS = 60;
const ID_TOKEN_SEGUNDOS = 5 * 60;
const ACCESS_TOKEN_SEGUNDOS = 10 * 60;
const ESCOPOS = ['openid', 'profile', 'email'];

const issuer = () => `${env.apiHorizon.publicUrl}/v1`;
const urlUserinfo = () => `${issuer()}/oauth/userinfo`;
const sha256 = (texto) => crypto.createHash('sha256').update(texto).digest('hex');
const base64urlSha256 = (texto) => crypto.createHash('sha256').update(texto).digest('base64url');

function iguais(hashHex, outroHex) {
  if (!hashHex || !outroHex || hashHex.length !== outroHex.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hashHex, 'hex'), Buffer.from(outroHex, 'hex'));
}

// URL + parâmetros (mantém os que a URL cadastrada já tiver).
function montarUrl(base, params) {
  const url = new URL(base);
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && url.searchParams.set(k, v));
  return url.toString();
}

// Botão Conectar da loja: a URL de abertura com o issuer (o parceiro confere e começa o login).
function urlConectar(urlAbertura) {
  return montarUrl(urlAbertura, { iss: issuer() });
}

// ───────────────────────── chaves de assinatura ─────────────────────────

const CACHE_MS = 5 * 60 * 1000;
let cacheAtiva = null;
let cachePublicas = null;

async function chaveAtiva() {
  if (cacheAtiva && cacheAtiva.expira > Date.now()) return cacheAtiva;
  let { rows } = await pool.query('SELECT kid, privada FROM oidc_chaves WHERE ativa');
  if (!rows.length) {
    // Primeira vez: gera o par RSA. Duas chamadas ao mesmo tempo → o índice único de "ativa" deixa
    // só uma entrar; a outra relê.
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = crypto.randomBytes(12).toString('base64url');
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' };
    await pool.query('INSERT INTO oidc_chaves (kid, privada, publica) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [
      kid,
      encrypt(privateKey.export({ type: 'pkcs8', format: 'pem' })),
      jwk,
    ]);
    ({ rows } = await pool.query('SELECT kid, privada FROM oidc_chaves WHERE ativa'));
    cachePublicas = null;
  }
  cacheAtiva = { kid: rows[0].kid, privada: crypto.createPrivateKey(decrypt(rows[0].privada)), expira: Date.now() + CACHE_MS };
  return cacheAtiva;
}

async function chavesPublicas() {
  if (cachePublicas && cachePublicas.expira > Date.now()) return cachePublicas.jwks;
  await chaveAtiva();
  const { rows } = await pool.query('SELECT publica FROM oidc_chaves WHERE publicada ORDER BY criado_em DESC');
  cachePublicas = { jwks: rows.map((r) => r.publica), expira: Date.now() + CACHE_MS };
  return cachePublicas.jwks;
}

// ───────────────────────── endereços públicos (/v1) ─────────────────────────

function descoberta(req, res) {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({
    issuer: issuer(),
    authorization_endpoint: `${env.frontendUrl.replace(/\/$/, '')}/oauth/authorize`,
    token_endpoint: `${issuer()}/oauth/token`,
    userinfo_endpoint: urlUserinfo(),
    jwks_uri: `${issuer()}/oauth/jwks`,
    scopes_supported: ESCOPOS,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code'],
    subject_types_supported: ['pairwise'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    claims_supported: ['iss', 'sub', 'aud', 'exp', 'iat', 'nonce', 'name', 'email'],
    authorization_response_iss_parameter_supported: true,
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
    claims_parameter_supported: false,
  });
}

async function jwks(req, res, next) {
  try {
    const keys = await chavesPublicas();
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ keys });
  } catch (err) {
    next(err);
  }
}

function erroOAuth(res, status, error, descricao, cabecalho) {
  if (cabecalho) res.set('WWW-Authenticate', cabecalho);
  res.set('Pragma', 'no-cache');
  return res.status(status).json({ error, error_description: descricao });
}

// client_secret_basic (Authorization: Basic) ou client_secret_post (client_id/client_secret no corpo).
function credenciaisDoCliente(req) {
  const auth = req.get('authorization') || '';
  if (/^basic\s/i.test(auth)) {
    try {
      const texto = Buffer.from(auth.replace(/^basic\s+/i, ''), 'base64').toString('utf8');
      const i = texto.indexOf(':');
      if (i < 0) return { basic: true };
      return { basic: true, clientId: decodeURIComponent(texto.slice(0, i)), clientSecret: decodeURIComponent(texto.slice(i + 1)) };
    } catch {
      return { basic: true };
    }
  }
  return { basic: false, clientId: req.body?.client_id, clientSecret: req.body?.client_secret };
}

async function token(req, res, next) {
  try {
    const corpo = req.body || {};
    const cred = credenciaisDoCliente(req);
    const clienteInvalido = () =>
      erroOAuth(res, 401, 'invalid_client', 'client_id ou client_secret inválido, ou aplicativo não aprovado.', cred.basic ? 'Basic realm="Horizon"' : undefined);
    if (
      typeof cred.clientId !== 'string' ||
      typeof cred.clientSecret !== 'string' ||
      !cred.clientId.startsWith(PREFIXO_CLIENT_ID) ||
      !cred.clientSecret.startsWith(PREFIXO_SECRET_OFICIAL)
    ) {
      return clienteInvalido();
    }
    const {
      rows: [p],
    } = await pool.query('SELECT id, status, client_id, secret_oficial_hash FROM parceiros WHERE client_id = $1', [cred.clientId]);
    if (!p || !iguais(p.secret_oficial_hash, hashSegredo(cred.clientSecret)) || p.status !== 'APROVADO') return clienteInvalido();

    if (corpo.grant_type !== 'authorization_code') return erroOAuth(res, 400, 'unsupported_grant_type', 'Use grant_type=authorization_code.');
    if (typeof corpo.code !== 'string' || !corpo.code) return erroOAuth(res, 400, 'invalid_request', 'Informe o code.');

    // Uso único: marca como usado na mesma instrução que lê.
    const {
      rows: [c],
    } = await pool.query(
      `UPDATE oidc_codigos SET usado_em = NOW()
       WHERE codigo_hash = $1 AND usado_em IS NULL
       RETURNING parceiro_id, usuario_id, redirect_uri, scope, nonce, code_challenge, expira_em > NOW() AS valido`,
      [sha256(corpo.code)]
    );
    if (!c || c.parceiro_id !== p.id || !c.valido) return erroOAuth(res, 400, 'invalid_grant', 'Código inválido, expirado ou já usado.');
    if (corpo.redirect_uri !== c.redirect_uri) return erroOAuth(res, 400, 'invalid_grant', 'redirect_uri diferente do usado na autorização.');
    if (c.code_challenge) {
      const verificador = corpo.code_verifier;
      if (typeof verificador !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verificador) || base64urlSha256(verificador) !== c.code_challenge) {
        return erroOAuth(res, 400, 'invalid_grant', 'code_verifier não confere com o code_challenge.');
      }
    } else if (corpo.code_verifier) {
      return erroOAuth(res, 400, 'invalid_grant', 'code_verifier enviado sem code_challenge na autorização.');
    }

    const {
      rows: [u],
    } = await pool.query(
      `UPDATE parceiros_usuarios pu SET logins = pu.logins + 1, ultimo_login_em = NOW()
       FROM usuarios u
       WHERE pu.parceiro_id = $1 AND pu.usuario_id = $2 AND u.id = pu.usuario_id AND u.ativo
       RETURNING pu.sub, u.nome, u.email`,
      [p.id, c.usuario_id]
    );
    if (!u) return erroOAuth(res, 400, 'invalid_grant', 'Usuário do Horizon inativo.');
    // Primeira conexão do aplicativo instalado: daqui em diante o ícone do menu lateral abre o sistema
    // do parceiro direto (sem a página do botão Conectar).
    await pool.query(
      'UPDATE parceiros_instalacoes SET conectado_em = NOW() WHERE parceiro_id = $1 AND usuario_id = $2 AND conectado_em IS NULL',
      [p.id, c.usuario_id]
    );

    const escopos = c.scope.split(' ');
    const dados = {
      ...(escopos.includes('profile') && { name: u.nome }),
      ...(escopos.includes('email') && u.email && { email: u.email }),
    };
    const chave = await chaveAtiva();
    const opcoes = { algorithm: 'RS256', keyid: chave.kid, issuer: issuer() };
    const idToken = jwt.sign({ ...dados, ...(c.nonce && { nonce: c.nonce }) }, chave.privada, {
      ...opcoes,
      subject: u.sub,
      audience: p.client_id,
      expiresIn: ID_TOKEN_SEGUNDOS,
    });
    const accessToken = jwt.sign({ scope: c.scope, client_id: p.client_id }, chave.privada, {
      ...opcoes,
      subject: u.sub,
      audience: urlUserinfo(),
      expiresIn: ACCESS_TOKEN_SEGUNDOS,
      header: { typ: 'at+jwt' },
    });
    res.set('Pragma', 'no-cache');
    return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TOKEN_SEGUNDOS, id_token: idToken, scope: c.scope });
  } catch (err) {
    next(err);
  }
}

async function userinfo(req, res, next) {
  try {
    const invalido = (descricao) => erroOAuth(res, 401, 'invalid_token', descricao, `Bearer error="invalid_token", error_description="${descricao}"`);
    const auth = req.get('authorization') || '';
    const token = /^bearer\s/i.test(auth) ? auth.replace(/^bearer\s+/i, '').trim() : req.body?.access_token;
    if (!token) return erroOAuth(res, 401, 'invalid_request', 'Envie o access_token em Authorization: Bearer.', 'Bearer');

    const decodificado = jwt.decode(token, { complete: true });
    if (decodificado?.header?.typ !== 'at+jwt') return invalido('access_token inválido.');
    const jwk = (await chavesPublicas()).find((k) => k.kid === decodificado.header.kid);
    if (!jwk) return invalido('access_token inválido.');
    let payload;
    try {
      payload = jwt.verify(token, crypto.createPublicKey({ key: jwk, format: 'jwk' }), {
        algorithms: ['RS256'],
        issuer: issuer(),
        audience: urlUserinfo(),
      });
    } catch {
      return invalido('access_token inválido ou expirado.');
    }

    const {
      rows: [u],
    } = await pool.query(
      `SELECT u.nome, u.email FROM parceiros_usuarios pu
       JOIN parceiros p ON p.id = pu.parceiro_id AND p.status = 'APROVADO' AND p.client_id = $2
       JOIN usuarios u ON u.id = pu.usuario_id AND u.ativo
       WHERE pu.sub = $1`,
      [payload.sub, payload.client_id]
    );
    if (!u) return invalido('Aplicativo suspenso ou usuário inativo.');
    const escopos = String(payload.scope || '').split(' ');
    return res.json({
      sub: payload.sub,
      ...(escopos.includes('profile') && { name: u.nome }),
      ...(escopos.includes('email') && u.email && { email: u.email }),
    });
  } catch (err) {
    next(err);
  }
}

// ───────────────────────── autorização (página /oauth/authorize) ─────────────────────────

function erroSemRetorno(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// Chamado pela página /oauth/authorize do frontend com os parâmetros que o parceiro mandou, já com
// o usuário logado. Devolve { redirect } — o callback com o code, ou com o erro OAuth quando o
// pedido é do parceiro certo mas está errado. Parceiro desconhecido/suspenso ou redirect_uri
// diferente do cadastrado: erro na tela, sem redirecionar (nunca manda o usuário para fora).
async function autorizar(usuarioId, q = {}) {
  const texto = (v) => (typeof v === 'string' ? v : '');
  const {
    rows: [p],
  } = await pool.query('SELECT id, status, app_nome, url_callback FROM parceiros WHERE client_id = $1', [texto(q.client_id)]);
  if (!p || p.status !== 'APROVADO') throw erroSemRetorno('Este aplicativo não está disponível no Horizon (não cadastrado ou suspenso).');
  if (texto(q.redirect_uri) !== p.url_callback) throw erroSemRetorno(`O endereço de retorno não é o cadastrado para o ${p.app_nome}.`);

  const state = texto(q.state).slice(0, 2048) || undefined;
  const voltarComErro = (error, descricao) => ({
    redirect: montarUrl(p.url_callback, { error, error_description: descricao, state, iss: issuer() }),
  });
  if (q.request || q.request_uri) return voltarComErro('request_not_supported', 'Parâmetros request/request_uri não são aceitos.');
  if (q.response_type !== 'code') return voltarComErro('unsupported_response_type', 'Use response_type=code.');
  const pedidos = texto(q.scope).split(/\s+/).filter(Boolean);
  if (!pedidos.includes('openid')) return voltarComErro('invalid_scope', 'O scope precisa ter openid.');
  const escopos = ESCOPOS.filter((e) => pedidos.includes(e));
  const nonce = texto(q.nonce);
  if (nonce.length > 512) return voltarComErro('invalid_request', 'nonce com mais de 512 caracteres.');
  const challenge = texto(q.code_challenge);
  if (challenge || q.code_challenge_method) {
    if (q.code_challenge_method !== 'S256') return voltarComErro('invalid_request', 'Use code_challenge_method=S256.');
    if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) return voltarComErro('invalid_request', 'code_challenge inválido.');
  }

  const {
    rows: [u],
  } = await pool.query('SELECT ativo, primeiro_acesso FROM usuarios WHERE id = $1', [usuarioId]);
  if (!u?.ativo) throw erroSemRetorno('Usuário inativo.');
  if (u.primeiro_acesso) throw erroSemRetorno('Conclua o primeiro acesso ao Horizon antes de conectar aplicativos.');

  // sub do usuário neste parceiro (criado no primeiro uso, nunca muda).
  await pool.query(
    `INSERT INTO parceiros_usuarios (parceiro_id, usuario_id, sub) VALUES ($1, $2, $3)
     ON CONFLICT (parceiro_id, usuario_id) DO NOTHING`,
    [p.id, usuarioId, `hzu_${crypto.randomBytes(16).toString('base64url')}`]
  );
  const codigo = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO oidc_codigos (codigo_hash, parceiro_id, usuario_id, redirect_uri, scope, nonce, code_challenge, expira_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + make_interval(secs => $8))`,
    [sha256(codigo), p.id, usuarioId, p.url_callback, escopos.join(' '), nonce || null, challenge || null, CODIGO_SEGUNDOS]
  );
  pool.query(`DELETE FROM oidc_codigos WHERE expira_em < NOW() - INTERVAL '1 day'`).catch(() => {});
  return { aplicativo: p.app_nome, redirect: montarUrl(p.url_callback, { code: codigo, state, iss: issuer() }) };
}

module.exports = { issuer, urlConectar, descoberta, jwks, token, userinfo, autorizar };
