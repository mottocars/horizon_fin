const { z } = require('zod');
const service = require('./dfcAging.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');

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

async function receber(req, res, next) {
  try {
    res.json(await service.receber(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function atualizarBase(req, res, next) {
  try {
    res.status(202).json(await service.atualizarBase(empresaIdSchema.parse(req.params.empresaId), req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

async function execucao(req, res, next) {
  try {
    res.json(await service.execucao(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { receber, atualizarBase, execucao };
