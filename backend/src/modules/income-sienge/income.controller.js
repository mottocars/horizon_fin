const { z } = require('zod');
const service = require('./income.service');

const empresaIdSchema = z.coerce.number().int().positive('Selecione uma empresa.');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function sincronizar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.body.empresa_id);
    const resultado = await service.sincronizar(empresaId);
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function getResumo(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const resumo = await service.getResumo(empresaId);
    res.json(resumo);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = { sincronizar, getResumo };
