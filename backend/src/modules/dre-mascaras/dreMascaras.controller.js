const { z } = require('zod');
const service = require('./dreMascaras.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const idSchema = z.coerce.number().int().positive('Máscara inválida.');

const descricaoSchema = z
  .string()
  .trim()
  .min(1, 'Informe o nome da máscara.')
  .max(150, 'Máximo de 150 caracteres.');

// `descricoes` (lista) em vez de uma só: colar várias linhas de uma vez no campo de criar
// (ver MascarasTab.jsx) cria todas numa chamada, na ordem em que vieram.
const createSchema = z.object({
  parent_id: z.union([z.null(), z.coerce.number().int().positive()]).optional().default(null),
  descricoes: z.array(descricaoSchema).min(1, 'Informe o nome da máscara.').max(200),
});

const updateSchema = z.object({ descricao: descricaoSchema });

// A estrutura inteira, já na ordem final: nível 1 na ordem do array e, em `filhos`, os ids de
// nível 2 de cada um. Por construção não dá pra mandar 3 níveis.
const ordemSchema = z.object({
  estrutura: z.array(
    z.object({
      id: idSchema,
      filhos: z.array(idSchema).default([]),
    })
  ),
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

async function create(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { parent_id: parentId, descricoes } = createSchema.parse(req.body);
    res.status(201).json(await service.create(empresaId, { parentId, descricoes }));
  } catch (err) {
    tratar(err, next);
  }
}

async function update(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = idSchema.parse(req.params.id);
    const { descricao } = updateSchema.parse(req.body);
    const item = await service.update(id, empresaId, { descricao });
    if (!item) throw erro(404, 'Máscara não encontrada.');
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
    if (!ok) throw erro(404, 'Máscara não encontrada.');
    res.json({ ok: true });
  } catch (err) {
    tratar(err, next);
  }
}

async function reordenar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { estrutura } = ordemSchema.parse(req.body);
    res.json(await service.reordenar(empresaId, estrutura));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, create, update, remove, reordenar };
