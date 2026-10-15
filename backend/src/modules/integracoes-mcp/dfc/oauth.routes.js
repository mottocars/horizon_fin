const path = require('path');
const express = require('express');
const cors = require('cors');
const oauth = require('./oauth.service');
const paginaLogin = require('./paginaLogin');
const { limiteLogin } = require('../../../middlewares/rateLimit.middleware');

// Rotas do OAuth do MCP do DFC (sem authMiddleware: quem chama é o Claude / o navegador do usuário
// no login). `router` vai em /api/mcp-oauth; `wellKnown` na raiz do site (/.well-known/...), onde os
// clientes MCP procuram os metadados — também respondidos dentro de /api/mcp-oauth.

const LOGO = path.join(__dirname, '..', '..', '..', 'assets', 'logomarca.png');

function responderErro(res, err) {
  if (err.oauth) return res.status(err.status || 400).set('Cache-Control', 'no-store').json(err.oauth);
  console.error('Erro no OAuth do MCP do DFC:', err);
  return res.status(500).json({ error: 'server_error', error_description: 'Erro interno.' });
}

const seguranca = (res) =>
  res.set({
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });

// Metadados (RFC 8414 / RFC 9728).
const wellKnown = express.Router();
wellKnown.use(cors({ origin: '*' }));
const metadadosServidor = (req, res) => res.json(oauth.metadadosServidor());
wellKnown.get('/oauth-authorization-server', metadadosServidor);
wellKnown.get('/oauth-authorization-server/*', metadadosServidor);
wellKnown.get('/oauth-protected-resource/api/mcp/dfc/:token', (req, res) => res.json(oauth.metadadosRecurso(req.params.token)));

const router = express.Router();
router.use(cors({ origin: '*' }));
router.use(express.urlencoded({ extended: false, limit: '20kb' }));
router.use('/.well-known', wellKnown);

router.get('/logo.png', (req, res) => res.sendFile(LOGO, { maxAge: '7d' }));

// Registro dinâmico de cliente (RFC 7591).
router.post('/register', async (req, res) => {
  try {
    res.status(201).set('Cache-Control', 'no-store').json(await oauth.registrarCliente(req.body || {}));
  } catch (err) {
    responderErro(res, err);
  }
});

// Confere os parâmetros do /authorize. Erro antes de confiar no redirect_uri = página de erro; depois,
// volta pro cliente com ?error=.
async function validarPedido(q) {
  const cli = await oauth.cliente(q.client_id);
  if (!cli) return { erroPagina: 'Cliente não registrado. Remova e adicione o conector de novo no Claude.' };
  const redirects = cli.redirect_uris || [];
  const redirect = q.redirect_uri || (redirects.length === 1 ? redirects[0] : null);
  if (!redirect || !redirects.includes(redirect)) return { erroPagina: 'redirect_uri não registrado para este cliente.' };
  const voltar = (error, descricao) => {
    const u = new URL(redirect);
    u.searchParams.set('error', error);
    if (descricao) u.searchParams.set('error_description', descricao);
    if (q.state) u.searchParams.set('state', q.state);
    return u.toString();
  };
  if (q.response_type !== 'code') return { redirecionar: voltar('unsupported_response_type', 'Use response_type=code.') };
  if (!q.code_challenge || (q.code_challenge_method || 'plain') !== 'S256') {
    return { redirecionar: voltar('invalid_request', 'PKCE S256 obrigatório.') };
  }
  const conector = await oauth.conectorPorToken(oauth.tokenDoRecurso(q.resource));
  if (!conector) return { erroPagina: 'Este link de conector não existe, foi desativado ou não é do DFC Construtoras.' };
  return { cli, redirect, conector };
}

const paramsDe = (q) => ({
  response_type: q.response_type,
  client_id: q.client_id,
  redirect_uri: q.redirect_uri,
  code_challenge: q.code_challenge,
  code_challenge_method: q.code_challenge_method,
  state: q.state,
  scope: q.scope,
  resource: q.resource,
});

router.get('/authorize', async (req, res) => {
  try {
    const v = await validarPedido(req.query);
    if (v.erroPagina) return seguranca(res).status(400).type('html').send(paginaLogin.erro(v.erroPagina));
    if (v.redirecionar) return res.redirect(302, v.redirecionar);
    seguranca(res).type('html').send(paginaLogin.login({ conector: v.conector, clienteNome: v.cli.client_name, params: paramsDe(req.query) }));
  } catch (err) {
    console.error('Erro no /authorize do MCP do DFC:', err);
    seguranca(res).status(500).type('html').send(paginaLogin.erro('Erro interno. Tente de novo.'));
  }
});

router.post('/authorize', limiteLogin, async (req, res) => {
  const b = req.body || {};
  try {
    const v = await validarPedido(b);
    if (v.erroPagina) return seguranca(res).status(400).type('html').send(paginaLogin.erro(v.erroPagina));
    if (v.redirecionar) return res.redirect(302, v.redirecionar);
    let usuario;
    try {
      usuario = await oauth.autenticar(b.usuario, b.senha, v.conector);
    } catch (err) {
      if (!err.oauth) throw err;
      return seguranca(res)
        .status(err.status)
        .type('html')
        .send(paginaLogin.login({ conector: v.conector, clienteNome: v.cli.client_name, params: paramsDe(b), erro: err.message, usuario: b.usuario }));
    }
    const code = await oauth.criarCodigo({
      clientId: v.cli.client_id,
      conectorId: v.conector.id,
      usuarioId: usuario.id,
      redirectUri: v.redirect,
      codeChallenge: b.code_challenge,
    });
    const u = new URL(v.redirect);
    u.searchParams.set('code', code);
    if (b.state) u.searchParams.set('state', b.state);
    u.searchParams.set('iss', oauth.urls().issuer);
    res.redirect(302, u.toString());
  } catch (err) {
    console.error('Erro no login do MCP do DFC:', err);
    seguranca(res).status(500).type('html').send(paginaLogin.erro('Erro interno. Tente de novo.'));
  }
});

// Token: authorization_code (com PKCE) e refresh_token.
router.post('/token', async (req, res) => {
  try {
    const b = req.body || {};
    let r;
    if (b.grant_type === 'authorization_code') r = await oauth.trocarCodigo(b);
    else if (b.grant_type === 'refresh_token') r = await oauth.renovar(b);
    else throw oauth.erroOAuth('unsupported_grant_type', 'Use authorization_code ou refresh_token.');
    res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }).json(r);
  } catch (err) {
    responderErro(res, err);
  }
});

module.exports = { router, wellKnown };
