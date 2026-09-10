const { z } = require('zod');
const service = require('./sienge.service');
const usuariosService = require('../usuarios/usuarios.service');

const createSchema = z.object({
  empresa_id: z.coerce.number().int().positive('Selecione uma empresa.'),
  tenant: z.string().min(1, 'Tenant é obrigatório.'),
  username: z.string().min(1, 'Username é obrigatório.'),
  password: z.string().min(1, 'Password é obrigatório.'),
});

const updateSchema = z.object({
  empresa_id: z.coerce.number().int().positive('Selecione uma empresa.'),
  tenant: z.string().min(1, 'Tenant é obrigatório.'),
  username: z.string().min(1, 'Username é obrigatório.'),
  password: z.string().optional(),
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
    let ativo;
    if (req.query.ativo === 'true') ativo = true;
    if (req.query.ativo === 'false') ativo = false;
    const solicitante = await usuariosService.getById(req.user.id);
    const isMaster = solicitante?.permissao === 'MASTER';
    const empresaIds = isMaster ? undefined : solicitante?.empresa_ids || [];
    const result = await service.list({ page, limit, search, ativo, empresaIds });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const item = await service.getById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Integração não encontrada.' });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = createSchema.parse(req.body);
    const item = await service.create(data);
    res.status(201).json(item);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    if (err.code === '23503') return next(badRequest('Empresa selecionada não existe.'));
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = updateSchema.parse(req.body);
    const item = await service.update(req.params.id, data);
    if (!item) return res.status(404).json({ message: 'Integração não encontrada.' });
    res.json(item);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    if (err.code === '23503') return next(badRequest('Empresa selecionada não existe.'));
    next(err);
  }
}

async function setStatus(req, res, next) {
  try {
    const ativo = Boolean(req.body.ativo);
    const item = await service.setAtivo(req.params.id, ativo);
    if (!item) return res.status(404).json({ message: 'Integração não encontrada.' });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, setStatus };
