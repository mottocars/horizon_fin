const { z } = require('zod');
const service = require('./vanpix.service');
const usuariosService = require('../usuarios/usuarios.service');

const apelidoSchema = z.string().trim().min(1, 'Apelido do convênio não pode ser vazio.').max(50, 'Apelido do convênio muito longo.');

const createSchema = z.object({
  empresa_id: z.coerce.number().int().positive('Selecione uma empresa.'),
  nome_conexao: z.string().min(1, 'Nome da conexão é obrigatório.'),
  service_key: z.string().min(1, 'Service Key é obrigatória.'),
  client_secret: z.string().min(1, 'Client Secret é obrigatório.'),
  apelidos: z.array(apelidoSchema).min(1, 'Informe ao menos 1 convênio (apelido).'),
});

const updateSchema = z.object({
  empresa_id: z.coerce.number().int().positive('Selecione uma empresa.'),
  nome_conexao: z.string().min(1, 'Nome da conexão é obrigatório.'),
  service_key: z.string().optional(),
  client_secret: z.string().optional(),
  apelidos: z.array(apelidoSchema).min(1, 'Informe ao menos 1 convênio (apelido).'),
});

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// Maiúsculo + sem repetição + ordenado — os apelidos do script de referência são todos
// maiúsculos (ex.: "ABPFJR"); normaliza aqui pra não depender de como o usuário digitou. A
// ordem alfabética também faz a resposta de create/update bater com a de getById/list (que
// já vêm ordenadas do banco, `ORDER BY apelido`).
function normalizarApelidos(lista) {
  return [...new Set(lista.map((a) => a.trim().toUpperCase()))].sort();
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
    // Master pode restringir a 1 empresa específica; não-Master já vem escopado nas próprias
    // empresas (mesmo padrão de zapi.controller.js).
    let empresaIds = isMaster ? undefined : solicitante?.empresa_ids || [];
    if (isMaster && req.query.empresa_id) empresaIds = [Number(req.query.empresa_id)];
    const result = await service.list({ page, limit, search, ativo, empresaIds });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const item = await service.getById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Conexão não encontrada.' });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = createSchema.parse(req.body);
    data.apelidos = normalizarApelidos(data.apelidos);
    const item = await service.create(data);
    res.status(201).json(item);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    if (err.code === '23503') return next(badRequest('Empresa selecionada não existe.'));
    if (err.code === '23505') return next(badRequest('Convênio (apelido) repetido.'));
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = updateSchema.parse(req.body);
    data.apelidos = normalizarApelidos(data.apelidos);
    const item = await service.update(req.params.id, data);
    if (!item) return res.status(404).json({ message: 'Conexão não encontrada.' });
    res.json(item);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    if (err.code === '23503') return next(badRequest('Empresa selecionada não existe.'));
    if (err.code === '23505') return next(badRequest('Convênio (apelido) repetido.'));
    next(err);
  }
}

async function setStatus(req, res, next) {
  try {
    const ativo = Boolean(req.body.ativo);
    const item = await service.setAtivo(req.params.id, ativo);
    if (!item) return res.status(404).json({ message: 'Conexão não encontrada.' });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, setStatus };
