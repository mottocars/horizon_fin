const { z } = require('zod');
const service = require('./chaves.service');
const { VALIDADES_DIAS } = require('./comum');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

const idSchema = z.coerce.number().int().positive();

const acessosSchema = z.object({
  grupos: z.array(z.string().trim().min(1)).max(50),
  escopos: z.array(z.string().trim().min(1)).max(50).default([]),
});

const gerarSchema = acessosSchema.extend({
  empresaId: z.coerce.number({ invalid_type_error: 'Escolha a empresa.' }).int().positive('Escolha a empresa.'),
  validadeDias: z.coerce
    .number()
    .int()
    .refine((v) => VALIDADES_DIAS.includes(v), 'Validade inválida.'),
});

// Envolve o handler: erros de validação (zod) viram 400 com a 1ª mensagem.
function rota(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err.issues) return next(badRequest(err.issues[0].message));
      next(err);
    }
  };
}

module.exports = {
  minha: rota(async (req, res) => res.json(await service.minha(req.user))),
  gerar: rota(async (req, res) => res.status(201).json(await service.gerar(req.user, gerarSchema.parse(req.body)))),
  alterarAcessos: rota(async (req, res) => res.json(await service.alterarAcessos(req.user, acessosSchema.parse(req.body)))),
  revogarMinha: rota(async (req, res) => {
    await service.revogarMinha(req.user);
    res.status(204).end();
  }),
  minhasRequisicoes: rota(async (req, res) => res.json({ data: await service.minhasRequisicoes(req.user) })),
  listarTodas: rota(async (req, res) => res.json({ data: await service.listarTodas() })),
  revogarDeUsuario: rota(async (req, res) => {
    await service.revogarDeUsuario(req.user, idSchema.parse(req.params.id));
    res.status(204).end();
  }),
  requisicoesDaChave: rota(async (req, res) => res.json({ data: await service.requisicoesDaChave(idSchema.parse(req.params.id)) })),
};
