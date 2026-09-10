const { z } = require('zod');
const service = require('./curva.service');

const calibragemSchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2100),
  mes: z.coerce.number().int().min(1).max(12),
  avancoMes: z.coerce.number(),
});

async function listCentros(req, res, next) {
  try {
    const result = await service.listCentros(req.params.empresaId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getCurva(req, res, next) {
  try {
    const result = await service.getCurva(req.params.empresaId, req.params.siengeId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function salvarCalibragem(req, res, next) {
  try {
    const data = calibragemSchema.parse(req.body);
    await service.salvarCalibragem(req.params.empresaId, req.params.siengeId, data, req.user.id);
    res.status(204).end();
  } catch (err) {
    if (err.issues) {
      const e = new Error(err.issues[0].message);
      e.status = 400;
      e.expose = true;
      return next(e);
    }
    next(err);
  }
}

module.exports = { listCentros, getCurva, salvarCalibragem };
