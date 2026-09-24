const { z } = require('zod');
const service = require('./categoriasOrcamento.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const idSchema = z.coerce.number().int().positive('Categoria inválida.');

// Maiúsculo sempre (pedido do usuário) — normaliza aqui, não só no front, pra valer mesmo
// batendo direto na API.
const corpoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'Informe o nome da categoria.')
    .max(80, 'Máximo de 80 caracteres.')
    .transform((v) => v.toUpperCase()),
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
    const { nome } = corpoSchema.parse(req.body);
    res.status(201).json(await service.create(empresaId, { nome }));
  } catch (err) {
    tratar(err, next);
  }
}

async function update(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = idSchema.parse(req.params.id);
    const { nome } = corpoSchema.parse(req.body);
    const item = await service.update(id, empresaId, { nome });
    if (!item) throw erro(404, 'Categoria não encontrada.');
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
    if (!ok) throw erro(404, 'Categoria não encontrada.');
    res.json({ ok: true });
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, create, update, remove };
