const { z } = require('zod');
const service = require('./cronogramaEtapas.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const idSchema = z.coerce.number().int().positive('Etapa inválida.');

const descricaoSchema = z
  .string()
  .trim()
  .min(1, 'Informe o nome da etapa.')
  .max(150, 'Máximo de 150 caracteres.');

const corSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida.')
  .transform((c) => c.toLowerCase());

// `descricoes` (lista) em vez de uma só: colar várias linhas de uma vez no campo de criar
// (ver CronogramaEtapasTab.jsx) cria todas numa chamada, na ordem em que vieram. `cores` é a cor
// de cada uma, na mesma posição (a que faltar fica com a cor padrão da coluna).
const createSchema = z
  .object({
    descricoes: z.array(descricaoSchema).min(1, 'Informe o nome da etapa.').max(200),
    cores: z.array(corSchema).optional().default([]),
  })
  .refine((b) => b.cores.length <= b.descricoes.length, 'Mais cores do que etapas.');

const updateSchema = z
  .object({ descricao: descricaoSchema.optional(), cor: corSchema.optional() })
  .refine((b) => b.descricao !== undefined || b.cor !== undefined, 'Nada para alterar.');

// A lista inteira de ids, já na ordem final.
const ordemSchema = z.object({ ids: z.array(idSchema) });

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

async function create(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { descricoes, cores } = createSchema.parse(req.body);
    res.status(201).json(await service.create(empresaId, descricoes, cores));
  } catch (err) {
    tratar(err, next);
  }
}

async function update(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = idSchema.parse(req.params.id);
    const { descricao, cor } = updateSchema.parse(req.body);
    const item = await service.update(id, empresaId, { descricao, cor });
    if (!item) throw erro(404, 'Etapa não encontrada.');
    res.json(item);
  } catch (err) {
    tratar(err, next);
  }
}

async function remove(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = idSchema.parse(req.params.id);
    const ok = await service.remove(id, empresaId);
    if (!ok) throw erro(404, 'Etapa não encontrada.');
    res.json({ ok: true });
  } catch (err) {
    tratar(err, next);
  }
}

async function reordenar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { ids } = ordemSchema.parse(req.body);
    res.json(await service.reordenar(empresaId, ids));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, create, update, remove, reordenar };
