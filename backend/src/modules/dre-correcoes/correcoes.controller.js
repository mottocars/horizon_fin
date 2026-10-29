const { z } = require('zod');
const service = require('./correcoes.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const idSchema = z.coerce.number().int().positive('Parâmetro inválido.');

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

async function parcelas(req, res, next) {
  try {
    res.json(
      await service.parcelas(
        empresaIdSchema.parse(req.params.empresaId),
        idSchema.parse(req.params.centroId),
        idSchema.parse(req.params.clienteId)
      )
    );
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { listar, parcelas };
