const { z } = require('zod');
const service = require('./cronogramaCentros.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');

// 'AAAA-MM-DD' de verdade (nada de 31/02) e com ano razoável — o campo de data do navegador passa
// por anos como 0002 enquanto se digita.
const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
  .refine((s) => {
    const ano = Number(s.slice(0, 4));
    return ano >= 1900 && ano <= 2200 && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  }, 'Data inválida.');

const naturezaSchema = z.object({
  natureza: z.enum(['OBRA', 'ADMINISTRATIVO']).nullable(),
});

// `datas`: as etapas que mudaram (data null = apagar). `data_termino` só muda se vier no corpo.
const datasSchema = z.object({
  datas: z
    .array(z.object({ etapa_id: z.coerce.number().int().positive('Etapa inválida.'), data: dataSchema.nullable() }))
    .max(200)
    .default([]),
  data_termino: dataSchema.nullable().optional(),
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

async function updateNatureza(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const { natureza } = naturezaSchema.parse(req.body);
    const centro = await service.updateNatureza(empresaId, siengeId, natureza);
    if (!centro) throw erro(404, 'Centro de custo não encontrado.');
    res.json(centro);
  } catch (err) {
    tratar(err, next);
  }
}

async function updateDatas(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const { datas, data_termino: dataTermino } = datasSchema.parse(req.body);
    res.json(await service.updateDatas(empresaId, siengeId, { datas, dataTermino }, req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, updateNatureza, updateDatas };
