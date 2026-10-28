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

const criarSchema = z.object({
  nome: z.string().trim().min(3, 'Dê um nome para a chave (ex.: "Integração GI").').max(100, 'Nome muito longo.'),
  empresaId: z.coerce.number().int().positive('Escolha a empresa.'),
  validadeDias: z.coerce
    .number()
    .int()
    .refine((v) => VALIDADES_DIAS.includes(v), 'Validade inválida.'),
  podeInativar: z.boolean().default(false),
});

async function listar(req, res, next) {
  try {
    res.json({ data: await service.listar(req.user) });
  } catch (err) {
    next(err);
  }
}

async function criar(req, res, next) {
  try {
    const dados = criarSchema.parse(req.body);
    res.status(201).json(await service.criar(req.user, dados));
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function revogar(req, res, next) {
  try {
    res.json(await service.revogar(req.user, idSchema.parse(req.params.id)));
  } catch (err) {
    if (err.issues) return next(badRequest('Chave inválida.'));
    next(err);
  }
}

async function requisicoes(req, res, next) {
  try {
    res.json({ data: await service.listarRequisicoes(req.user, idSchema.parse(req.params.id)) });
  } catch (err) {
    if (err.issues) return next(badRequest('Chave inválida.'));
    next(err);
  }
}

module.exports = { listar, criar, revogar, requisicoes };
