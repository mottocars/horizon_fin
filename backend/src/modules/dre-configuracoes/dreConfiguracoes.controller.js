const { z } = require('zod');
const service = require('./dreConfiguracoes.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const pocSchema = z.object({
  mascara_id: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().positive().nullable()),
});
const documentosSchema = z.object({
  excluidos: z.array(z.string().trim().min(1).max(20)).max(500),
});

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

async function obter(req, res, next) {
  try {
    res.json(await service.obter(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function salvarPocReceita(req, res, next) {
  try {
    const { mascara_id: mascaraId } = pocSchema.parse(req.body || {});
    res.json(await service.salvarPocReceita(empresaIdSchema.parse(req.params.empresaId), mascaraId, req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

async function salvarDocumentos(req, res, next) {
  try {
    const { excluidos } = documentosSchema.parse(req.body || {});
    res.json(await service.salvarDocumentos(empresaIdSchema.parse(req.params.empresaId), excluidos, req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

async function previaPoc(req, res, next) {
  try {
    res.json(await service.previaPoc(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { obter, salvarPocReceita, salvarDocumentos, previaPoc };
