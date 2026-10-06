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
// uma pessoa erra a senha algumas vezes.
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.username || '').trim().toLowerCase()}`,
  handler: respostaLimite('Muitas tentativas de login. Aguarde 15 minutos e tente novamente.'),
});

// Conector MCP (/api/mcp/<token>): não usa o Bearer do sistema — conta
// pelo próprio token da URL.
const limiteMcp = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `mcp:${req.path.split('/')[1] || ipKeyGenerator(req.ip)}`,
  handler: respostaLimite('Muitas requisições em pouco tempo. Aguarde um minuto e tente novamente.'),
});

module.exports = { limiteGeral, limiteDownloadsSeAplicavel, limiteLogin, limiteMcp };
