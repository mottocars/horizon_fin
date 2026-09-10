const { z } = require('zod');
const service = require('./curva.service');

const previstoSchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2100),
  mes: z.coerce.number().int().min(1).max(12),
  valorPrevisto: z.coerce.number(),
});

const previstoUnidadesSchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2100),
  mes: z.coerce.number().int().min(1).max(12),
  unitIds: z.array(z.coerce.number().int().positive()),
});

const unidadesDisponiveisQuerySchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2100),
  mes: z.coerce.number().int().min(1).max(12),
});

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

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

async function salvarPrevisto(req, res, next) {
  try {
    const data = previstoSchema.parse(req.body);
    await service.salvarPrevisto(req.params.empresaId, req.params.siengeId, data, req.user.id);
    res.status(204).end();
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function salvarPrevistoPorUnidades(req, res, next) {
  try {
    const data = previstoUnidadesSchema.parse(req.body);
    const result = await service.salvarPrevistoPorUnidades(
      req.params.empresaId,
      req.params.siengeId,
      data,
      req.user.id
    );
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listUnidadesDisponiveis(req, res, next) {
  try {
    const { ano, mes } = unidadesDisponiveisQuerySchema.parse(req.query);
    const result = await service.listUnidadesDisponiveis(
      req.params.empresaId,
      req.params.siengeId,
      ano,
      mes
    );
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listUnidadesVendidasNoMes(req, res, next) {
  try {
    const { ano, mes } = unidadesDisponiveisQuerySchema.parse(req.query);
    const result = await service.listUnidadesVendidasNoMes(
      req.params.empresaId,
      req.params.siengeId,
      ano,
      mes
    );
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = {
  listCentros,
  getCurva,
  salvarPrevisto,
  salvarPrevistoPorUnidades,
  listUnidadesDisponiveis,
  listUnidadesVendidasNoMes,
};
