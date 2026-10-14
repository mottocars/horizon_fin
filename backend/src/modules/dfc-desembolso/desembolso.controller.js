const { z } = require('zod');
const service = require('./desembolso.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Conta inválida.');

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

// Prazo Desembolso das naturezas (cria antes as fichas que faltarem).
async function listar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    await service.criarFaltantes(empresaId);
    res.json(await service.listar(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

async function obter(req, res, next) {
  try {
    res.json(
      await service.obter(empresaIdSchema.parse(req.params.empresaId), siengeIdSchema.parse(req.params.siengeId), req.user.id)
    );
  } catch (err) {
    tratar(err, next);
  }
}

async function recalcular(req, res, next) {
  try {
    res.json(
      await service.gravar(empresaIdSchema.parse(req.params.empresaId), siengeIdSchema.parse(req.params.siengeId), req.user.id)
    );
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { listar, obter, recalcular };
