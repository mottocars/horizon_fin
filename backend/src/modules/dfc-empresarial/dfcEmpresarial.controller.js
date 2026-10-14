const { z } = require('zod');
const service = require('./dfcEmpresarial.service');

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

// Situação da base (pra janela Nova versão): { parcelas (= registros), orcamentos, atualizado_em }.
async function base(req, res, next) {
  try {
    res.json({ base: await service.base(empresaIdSchema.parse(req.params.empresaId)) });
  } catch (err) {
    tratar(err, next);
  }
}

async function valores(req, res, next) {
  try {
    res.json(await service.valores(empresaIdSchema.parse(req.params.empresaId)));
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

module.exports = { base, valores, atualizarBase, execucao };
