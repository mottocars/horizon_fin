const { z } = require('zod');
const service = require('./dfcOrcamento.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const logSchema = z.object({
  centro: z.coerce.number().int().positive('Centro de custo inválido.'),
  conta: z.coerce.number().int().positive('Conta inválida.'),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.'),
});

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

function tratar(err, next) {
  if (err.issues) return next(erro(400, err.issues[0].message));
  return next(err);
}

// `?versao=N`: uma versão salva; sem ele, a última.
async function orcamento(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const numero = z
      .preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().positive('Versão inválida.').nullable())
      .parse(req.query.versao);
    res.json(await service.orcamento(empresaId, numero));
  } catch (err) {
    tratar(err, next);
  }
}

async function rascunho(req, res, next) {
  try {
    res.json(await service.rascunho(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function salvarVersao(req, res, next) {
  try {
    res.status(201).json(await service.salvarVersao(empresaIdSchema.parse(req.params.empresaId), req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

async function log(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { centro, conta, mes } = logSchema.parse(req.query);
    res.json(await service.log(empresaId, centro, conta, mes));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { orcamento, rascunho, salvarVersao, log };
