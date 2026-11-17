const { Router } = require('express');
const { z } = require('zod');
const authMiddleware = require('../../middlewares/auth.middleware');
const service = require('./parceiros.service');
const oidc = require('./oidc');

// Dois routers, montados em server.js:
//   /api/parceiros         → Cadastros › Parceiros (exige a tela);
//   /api/loja-aplicativos  → qualquer usuário logado: a Loja de aplicativos do topo (aprovados);
//   /api/oidc              → qualquer usuário logado: a página /oauth/authorize (Login com Horizon).
// As rotas públicas (formulário "Quero ser um Parceiro" e troca do client_secret) ficam na API
// Horizon — ver parceiros.publico.js e api-horizon/v1/v1.routes.js.

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

const idSchema = z.coerce.number().int().positive('Parceiro inválido.');
const STATUS = ['EM_ANALISE', 'APROVADO', 'RECUSADO', 'SUSPENSO'];
const motivoSchema = z.object({ motivo: z.string().trim().max(500, 'Motivo com no máximo 500 caracteres.').optional().default('') });

function rota(fn) {
  return async (req, res, next) => {
    try {
      const r = await fn(req, res);
      if (r !== undefined) res.json(r);
    } catch (err) {
      if (err.issues) return next(badRequest(err.issues[0].message));
      next(err);
    }
  };
}

function enviarLogo(res, buffer) {
  if (!buffer) return res.status(404).json({ message: 'Sem logomarca.' });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  // A logo vem de fora: nada de executar nada que estiver dentro dela.
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(buffer);
}

const cadastro = Router();
cadastro.use(authMiddleware);
cadastro.get(
  '/',
  rota((req) => {
    const status = STATUS.includes(req.query.status) ? req.query.status : undefined;
    return service.listar({ status });
  })
);
cadastro.get('/:id', rota((req) => service.obter(idSchema.parse(req.params.id))));
cadastro.get(
  '/:id/logo',
  rota(async (req, res) => {
    enviarLogo(res, await service.logo(idSchema.parse(req.params.id)));
  })
);
cadastro.post('/:id/verificar', rota((req) => service.verificarESalvar(idSchema.parse(req.params.id))));
cadastro.post('/:id/aprovar', rota((req) => service.aprovar(idSchema.parse(req.params.id), req.user.id)));
cadastro.post(
  '/:id/recusar',
  rota((req) => service.recusar(idSchema.parse(req.params.id), req.user.id, motivoSchema.parse(req.body || {}).motivo))
);
cadastro.post(
  '/:id/suspender',
  rota((req) => service.suspender(idSchema.parse(req.params.id), req.user.id, motivoSchema.parse(req.body || {}).motivo))
);
cadastro.post('/:id/reativar', rota((req) => service.reativar(idSchema.parse(req.params.id), req.user.id)));
cadastro.post(
  '/:id/novo-secret',
  rota((req) =>
    service.novoSecretTemporario(idSchema.parse(req.params.id), req.user.id, { revogarOficial: req.body?.revogar_oficial === true })
  )
);

const loja = Router();
loja.use(authMiddleware);
loja.get('/', rota((req) => service.loja(req.user.id)));
// Instalados (menu lateral) e a página do aplicativo aberto dentro do Horizon.
loja.get('/instalados', rota((req) => service.instalados(req.user.id)));
loja.post('/:id/instalar', rota((req) => service.instalar(req.user.id, idSchema.parse(req.params.id))));
loja.delete('/:id/instalar', rota((req) => service.desinstalar(req.user.id, idSchema.parse(req.params.id))));
loja.get('/:id', rota((req) => service.aplicativo(req.user.id, idSchema.parse(req.params.id))));
loja.get(
  '/:id/logo',
  rota(async (req, res) => {
    enviarLogo(res, await service.logo(idSchema.parse(req.params.id), { soAprovado: true }));
  })
);

// Página /oauth/authorize do frontend (Login com Horizon): o usuário logado autoriza e volta ao
// callback do parceiro com o code — ver oidc.js.
const oidcSistema = Router();
oidcSistema.post(
  '/autorizar',
  rota((req) => oidc.autorizar(req.user.id, req.body || {}))
);

module.exports = { cadastro, loja, oidc: oidcSistema };
