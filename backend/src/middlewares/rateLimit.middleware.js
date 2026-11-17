const jwt = require('jsonwebtoken');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const env = require('../config/env');

// Limite de chamadas da API — contra robô raspando dados pelo navegador
// (com o token de um usuário logado) e contra força bruta no login.
//
// A contagem é por USUÁRIO quando a chamada traz um token válido (assim
// um robô não escapa trocando de IP, e várias pessoas atrás do mesmo IP do
// escritório não dividem a mesma cota). Sem token válido, conta por IP.
// Fica tudo em memória do processo: reiniciar o backend zera as contagens.

function chaveUsuarioOuIp(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), env.jwt.secret);
      return `u:${payload.sub}`;
    } catch {
      // token inválido/expirado — conta pelo IP
    }
  }
  return `ip:${ipKeyGenerator(req.ip)}`;
}

function respostaLimite(mensagem) {
  return (req, res) => res.status(429).json({ message: mensagem });
}

// Geral: toda a API. Uma pessoa usando as telas fica muito abaixo disso
// (mesmo as telas que disparam várias chamadas ao abrir); um script
// baixando dados em sequência bate no teto em segundos.
const limiteGeral = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: chaveUsuarioOuIp,
  handler: respostaLimite('Muitas requisições em pouco tempo. Aguarde um minuto e tente novamente.'),
});

// Downloads e exportações (XML/PDF de notas, anexos, boletos, planilhas):
// são o alvo mais comum de raspagem e os mais pesados — teto bem menor.
const limiteDownloads = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: chaveUsuarioOuIp,
  handler: respostaLimite('Muitos downloads em pouco tempo. Aguarde um minuto e tente novamente.'),
});

function ehDownload(req) {
  return /\/(download|download-pdf|downloads?|exportar|export|boletos?)(\/|$)/i.test(req.path);
}

function limiteDownloadsSeAplicavel(req, res, next) {
  if (!ehDownload(req)) return next();
  return limiteDownloads(req, res, next);
}

// Login: por IP + usuário digitado — trava tentativa de senha em massa
// contra uma conta sem bloquear o escritório inteiro (mesmo IP) quando
// uma pessoa erra a senha algumas vezes. Vale pra tela de login
// (`username`) e pro login do conector MCP (`usuario`).
const JANELA_LOGIN_MS = 15 * 60 * 1000;
const LIMITE_LOGIN = 10;

// Chaves do limite de login por usuário digitado — o contador fica guardado
// por "IP:usuário", então pra achar (e liberar) os bloqueios de um usuário
// em Cadastros › Usuários é preciso saber de quais IPs ele tentou. Entradas
// vencidas saem a cada 5 minutos; o teto evita crescer sem fim com nomes
// inventados (o limite geral por IP já segura isso bem antes).
const chavesLogin = new Map(); // chave -> { usuario, expira }
const MAX_CHAVES_LOGIN = 50000;
setInterval(() => {
  const agora = Date.now();
  for (const [chave, info] of chavesLogin) if (info.expira <= agora) chavesLogin.delete(chave);
}, 5 * 60 * 1000).unref();

function usuarioDigitado(req) {
  return String(req.body?.username ?? req.body?.usuario ?? '').trim().toLowerCase();
}

const limiteLogin = rateLimit({
  windowMs: JANELA_LOGIN_MS,
  limit: LIMITE_LOGIN,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const usuario = usuarioDigitado(req);
    const chave = `${ipKeyGenerator(req.ip)}:${usuario}`;
    if (usuario && (chavesLogin.has(chave) || chavesLogin.size < MAX_CHAVES_LOGIN)) {
      chavesLogin.set(chave, { usuario, expira: Date.now() + JANELA_LOGIN_MS });
    }
    return chave;
  },
  handler: respostaLimite('Muitas tentativas de login. Aguarde 15 minutos e tente novamente.'),
});

// Conector MCP (/api/mcp/<token>): não usa o Bearer do sistema — conta
// pelo próprio token da URL.
const limiteMcp = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // /api/mcp/<token> ou /api/mcp/dfc/<token> (conector DFC Construtoras): limite por conector.
  keyGenerator: (req) => {
    const partes = req.path.split('/');
    const token = partes[1] === 'dfc' ? partes[2] : partes[1];
    return `mcp:${token || ipKeyGenerator(req.ip)}`;
  },
  handler: respostaLimite('Muitas requisições em pouco tempo. Aguarde um minuto e tente novamente.'),
});

// Bloqueios temporários de um usuário (Cadastros › Usuários › Desbloquear).
// Tudo em memória do processo, como os próprios limites.
const LIMITES_DO_USUARIO = [
  {
    tipo: 'CHAMADAS',
    descricao: 'Muitas requisições em pouco tempo',
    limitador: limiteGeral,
    limite: 240,
  },
  {
    tipo: 'DOWNLOADS',
    descricao: 'Muitos downloads em pouco tempo',
    limitador: limiteDownloads,
    limite: 40,
  },
];

function chavesLoginDe(username) {
  const alvo = String(username || '').trim().toLowerCase();
  if (!alvo) return [];
  return [...chavesLogin].filter(([, info]) => info.usuario === alvo).map(([chave]) => chave);
}

function bloqueado(info, limite, agora) {
  return Boolean(info && info.resetTime && info.resetTime.getTime() > agora && info.totalHits > limite);
}

async function bloqueiosDoUsuario({ id, username }) {
  const agora = Date.now();
  const lista = [];
  const alvo = String(username || '').trim().toLowerCase();
  for (const chave of chavesLoginDe(alvo)) {
    const info = await limiteLogin.getKey(chave);
    if (!bloqueado(info, LIMITE_LOGIN, agora)) continue;
    lista.push({
      tipo: 'LOGIN',
      descricao: 'Senha errada muitas vezes',
      ip: chave.slice(0, chave.length - alvo.length - 1),
      ate: info.resetTime.toISOString(),
    });
  }
  for (const l of LIMITES_DO_USUARIO) {
    const info = await l.limitador.getKey(`u:${id}`);
    if (bloqueado(info, l.limite, agora)) {
      lista.push({ tipo: l.tipo, descricao: l.descricao, ip: null, ate: info.resetTime.toISOString() });
    }
  }
  return lista;
}

// Zera os contadores (bloqueado ou não): depois disso o usuário volta a ter
// as 10 tentativas de senha e a cota inteira de chamadas.
async function liberarUsuario({ id, username }) {
  for (const chave of chavesLoginDe(username)) {
    await limiteLogin.resetKey(chave);
    chavesLogin.delete(chave);
  }
  for (const l of LIMITES_DO_USUARIO) await l.limitador.resetKey(`u:${id}`);
}

module.exports = {
  limiteGeral,
  limiteDownloadsSeAplicavel,
  limiteLogin,
  limiteMcp,
  bloqueiosDoUsuario,
  liberarUsuario,
};
