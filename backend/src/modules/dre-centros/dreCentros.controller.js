const { z } = require('zod');
const service = require('./dreCentros.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');

const updateSchema = z.object({
  realiza_dre: z.boolean({ required_error: 'Informe o Realiza DRE.', invalid_type_error: 'Realiza DRE inválido.' }),
});

const ordemSchema = z.object({
  ordem: z.array(z.coerce.number().int().positive('Centro de custo inválido.')).max(2000),
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

async function list(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.list(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

async function update(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const { realiza_dre: realizaDre } = updateSchema.parse(req.body);
    const item = await service.update(empresaId, siengeId, realizaDre);
    if (!item) throw erro(404, 'Centro de custo não encontrado.');
    res.json(item);
  } catch (err) {
    tratar(err, next);
  }
}

async function reordenar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { ordem } = ordemSchema.parse(req.body || {});
    res.json(await service.reordenar(empresaId, ordem));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, update, reordenar };
