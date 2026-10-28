const { Router } = require('express');
const cors = require('cors');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const pool = require('../../../config/db');
const env = require('../../../config/env');
const { responderErro } = require('./erros');
const { emitirToken, exigirToken, exigirGrupo, exigirEscopo } = require('./autenticacao');
const controller = require('./v1.controller');

// API pública Horizon, versão 1 — montada em /api/v1 (em produção: https://api.horizonhub.com.br/v1).
// Documentação: api-docs/. Fora do CORS e dos limites do sistema (ver server.js): tem os próprios.

const router = Router();

// O "Testar" da documentação chama pelo navegador. Integrações servidor-a-servidor não usam CORS.
router.use(
  cors({
    origin: env.apiHorizon.origensDocs,
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Authorization', 'X-Api-Key', 'Content-Type'],
    exposedHeaders: ['RateLimit', 'RateLimit-Policy', 'Retry-After', 'Content-Disposition'],
    maxAge: 600,
  })
);

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});

// Registro de toda chamada (Integrações > API Horizon > Chamadas). Chave e token vão em
// cabeçalho, então a query string pode ser gravada.
router.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const inicio = Date.now();
  res.on('finish', () => {
    const consulta = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1) : null;
    pool
      .query(
        `INSERT INTO api_horizon_requisicoes (chave_id, usuario_id, metodo, rota, consulta, status, ip, user_agent, duracao_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          req.apiHorizon?.chaveId || null,
          req.apiHorizon?.usuarioId || null,
          req.method,
          `${req.baseUrl}${req.path}`.slice(0, 300),
          consulta ? consulta.slice(0, 1000) : null,
          res.statusCode,
          req.ip,
          (req.get('user-agent') || '').slice(0, 300) || null,
          Date.now() - inicio,
        ]
      )
      .catch((err) => console.error('[api-horizon] registro:', err.message));
  });
  next();
});

function limite({ limit, chave, mensagem }) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: chave,
    handler: (req, res) => {
      const segundos = Math.max(1, Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000));
      res.set('Retry-After', String(segundos));
      responderErro(res, 429, 'LIMITE_EXCEDIDO', mensagem);
    },
  });
}

// Por IP: barra quem martela sem chave/token válidos.
const limitePorIp = limite({
  limit: 120,
  chave: (req) => `ip:${ipKeyGenerator(req.ip)}`,
  mensagem: 'Muitas requisições deste endereço. Aguarde um minuto.',
});
const limiteToken = limite({
  limit: 30,
  chave: (req) => `token:${ipKeyGenerator(req.ip)}`,
  mensagem: 'Muitos tokens gerados em pouco tempo. Reaproveite o token até ele expirar (15 minutos).',
});
// Por chave de API: 60 consultas por minuto.
const limitePorChave = limite({
  limit: 60,
  chave: (req) => `chave:${req.apiHorizon.chaveId}`,
  mensagem: 'Limite de 60 requisições por minuto desta chave excedido. Aguarde e tente de novo.',
});

router.use(limitePorIp);

router.post('/auth/token', limiteToken, emitirToken);

// Grupo Notas fiscais (Espião NF-e / NFS-e). Grupo novo: mesmo padrão — token, limite e
// exigirGrupo('<id>') (cadastrado em ../grupos.js e documentado em api-docs/src/endpoints.js).
const notas = [exigirToken, limitePorChave, exigirGrupo('notas-fiscais')];
router.get('/certificados', ...notas, controller.certificados);
router.get('/notas-fiscais', ...notas, controller.notas);
router.get('/notas-fiscais/:id', ...notas, controller.nota);
router.get('/notas-fiscais/:id/xml', ...notas, controller.xml);
router.patch('/notas-fiscais/:id/inativar', ...notas, exigirEscopo('notas:inativar', 'Inativar notas'), controller.inativar);

router.use((req, res) => responderErro(res, 404, 'ROTA_NAO_ENCONTRADA', `Rota não encontrada: ${req.method} ${req.baseUrl}${req.path}`));

module.exports = router;
