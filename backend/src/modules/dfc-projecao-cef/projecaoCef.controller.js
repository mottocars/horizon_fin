const { z } = require('zod');
const service = require('./projecaoCef.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');

function tratar(err, next) {
  if (err.issues) {
    const e = new Error(err.issues[0].message);
    e.status = 400;
    e.expose = true;
    return next(e);
  }
  return next(err);
}

async function elegiveis(req, res, next) {
  try {
    res.json(await service.elegiveis(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function atualizar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    res.json(await service.atualizar(empresaId, siengeId, req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

async function orcamento(req, res, next) {
  try {
    res.json(await service.orcamento(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { elegiveis, atualizar, orcamento };
