const { z } = require('zod');
const service = require('./dfcAging.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
// 'receber' (contas a receber) ou 'pagar' (contas a pagar).
const tipoSchema = z.enum(Object.keys(service.TIPOS), { errorMap: () => ({ message: 'Tipo de aging inválido.' }) });

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

async function aging(req, res, next) {
  try {
    res.json(await service.aging(empresaIdSchema.parse(req.params.empresaId), tipoSchema.parse(req.params.tipo)));
  } catch (err) {
    tratar(err, next);
  }
}

async function atualizarBase(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.status(202).json(await service.atualizarBase(empresaId, tipoSchema.parse(req.params.tipo), req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

async function execucao(req, res, next) {
  try {
    res.json(await service.execucao(empresaIdSchema.parse(req.params.empresaId), tipoSchema.parse(req.params.tipo)));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { aging, atualizarBase, execucao };
