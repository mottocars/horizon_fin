const { z } = require('zod');
const service = require('./email.service');
const usuariosService = require('../usuarios/usuarios.service');

const DRIVERS_VALIDOS = ['smtp'];
const ENCRIPTACOES_VALIDAS = ['tls', 'ssl', 'none'];

const createSchema = z.object({
  empresa_id: z.coerce.number().int().positive('Selecione uma empresa.'),
  nome_conexao: z.string().min(1, 'Nome da conexão é obrigatório.'),
  driver: z.enum(DRIVERS_VALIDOS, { errorMap: () => ({ message: 'Driver inválido.' }) }),
  host: z.string().min(1, 'Host é obrigatório.'),
  porta: z.coerce.number().int().positive('Porta é obrigatória.'),
  encriptacao: z.enum(ENCRIPTACOES_VALIDAS, { errorMap: () => ({ message: 'Encriptação inválida.' }) }),
  email: z.string().email('Informe um e-mail válido.'),
  senha: z.string().min(1, 'Senha é obrigatória.'),
});

const testarConexaoSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  host: z.string().min(1, 'Host é obrigatório.'),
  porta: z.coerce.number().int().positive('Porta é obrigatória.'),
  encriptacao: z.enum(ENCRIPTACOES_VALIDAS, { errorMap: () => ({ message: 'Encriptação inválida.' }) }),
  email: z.string().email('Informe um e-mail válido.'),
  senha: z.string().optional(),
});

const updateSchema = z.object({
  empresa_id: z.coerce.number().int().positive('Selecione uma empresa.'),
  nome_conexao: z.string().min(1, 'Nome da conexão é obrigatório.'),
  driver: z.enum(DRIVERS_VALIDOS, { errorMap: () => ({ message: 'Driver inválido.' }) }),
  host: z.string().min(1, 'Host é obrigatório.'),
  porta: z.coerce.number().int().positive('Porta é obrigatória.'),
  encriptacao: z.enum(ENCRIPTACOES_VALIDAS, { errorMap: () => ({ message: 'Encriptação inválida.' }) }),
  email: z.string().email('Informe um e-mail válido.'),
  senha: z.string().optional(),
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
    // Master pode restringir a 1 empresa específica (ex.: combobox de
    // conexão da régua de cobrança, que é configurada empresa por empresa);
    // não-Master já vem escopado nas próprias empresas, o filtro é ignorado.
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

// Testa a conexão SMTP antes de salvar (ou a partir de uma já salva, sem
// reenviar a senha) — ver service.testarConexao. Não confunde com
// "enviei e não chegou": só confirma que dá pra conectar e autenticar,
// nada sobre entrega/spam do lado do destinatário.
async function testarConexao(req, res, next) {
  try {
    const dados = testarConexaoSchema.parse(req.body);
    const resultado = await service.testarConexao(dados);
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
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

module.exports = { list, getById, create, update, setStatus, testarConexao };
