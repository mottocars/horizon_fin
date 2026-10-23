const { z } = require('zod');
const service = require('./fracaoIdeal.service');

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

async function listar(req, res, next) {
  try {
    res.json(await service.listar(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function sincronizar(req, res, next) {
  try {
    res.json(await service.sincronizar(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function statusSincronizacao(req, res, next) {
  try {
    res.json(service.getStatusSincronizacao(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { listar, sincronizar, statusSincronizacao };
