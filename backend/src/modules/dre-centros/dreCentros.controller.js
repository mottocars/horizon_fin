const { z } = require('zod');
const service = require('./dreCentros.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');

const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

// Corpo parcial: só o que vier muda. `natureza` = o Tipo (Obra / Administrativo) — a MESMA coluna do
// cadastro que a aba Centros Custos da DFC grava (centros_custo_sienge.natureza): mudar aqui muda lá.
const updateSchema = z.object({
  realiza_dre: z.boolean({ invalid_type_error: 'Realiza DRE inválido.' }).optional(),
  natureza: z
    .preprocess(
      emptyToNull,
      z.enum(['OBRA', 'ADMINISTRATIVO'], { errorMap: () => ({ message: 'Escolha Obra ou Administrativo.' }) }).nullable()
    )
    .optional(),
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
    const corpo = req.body || {};
    const dados = updateSchema.parse(corpo);
    const patch = {};
    if (dados.realiza_dre !== undefined) patch.realiza_dre = dados.realiza_dre;
    if ('natureza' in corpo) patch.natureza = dados.natureza ?? null;
    if (!Object.keys(patch).length) throw erro(400, 'Nada para alterar.');
    const item = await service.update(empresaId, siengeId, patch);
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
