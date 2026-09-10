const { z } = require('zod');
const service = require('./clientes.service');

const clienteSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório.'),
  email: z.string().email('E-mail inválido.'),
  telefone: z.string().optional().nullable(),
});

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function list(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const search = (req.query.search || '').toString();
    const result = await service.list({ page, limit, search });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const cliente = await service.getById(req.params.id);
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });
    res.json(cliente);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = clienteSchema.parse(req.body);
    const cliente = await service.create(data);
    res.status(201).json(cliente);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = clienteSchema.parse(req.body);
    const cliente = await service.update(req.params.id, data);
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });
    res.json(cliente);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const removed = await service.remove(req.params.id);
    if (!removed) return res.status(404).json({ message: 'Cliente não encontrado.' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, remove };
