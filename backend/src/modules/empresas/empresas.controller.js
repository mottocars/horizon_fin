const { z } = require('zod');
const service = require('./empresas.service');
const usuariosService = require('../usuarios/usuarios.service');

const empresaSchema = z.object({
  cnpj: z.string().min(14),
  razao_social: z.string().min(1, 'Razão social é obrigatória.'),
  nome_fantasia: z.string().optional().nullable(),
  cep: z.string().optional().nullable(),
  logradouro: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  complemento: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  estado: z.string().optional().nullable(),
  telefone: z.string().optional().nullable(),
  situacao_cadastral: z.string().optional().nullable(),
  data_inicio_atividade: z.string().optional().nullable(),
});

const updateSchema = empresaSchema.omit({ cnpj: true });

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

function forbidden(message) {
  const err = new Error(message);
  err.status = 403;
  err.expose = true;
  return err;
}

// Defesa em profundidade: usuários abaixo de Master só podem ver/alterar as
// próprias empresas, mesmo que tentem acessar outra diretamente pela URL/API.
async function garantirEmpresaPermitida(req, empresaIdAlvo) {
  const solicitante = await usuariosService.getById(req.user.id);
  if (solicitante?.permissao === 'MASTER') return;
  const permitidas = (solicitante?.empresa_ids || []).map(Number);
  if (!permitidas.includes(Number(empresaIdAlvo))) {
    throw forbidden('Você só pode acessar informações das suas próprias empresas.');
  }
}

async function consultarCnpj(req, res, next) {
  try {
    const data = await service.consultarCnpj(req.params.cnpj);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const search = (req.query.search || '').toString();
    let ativo;
    if (req.query.ativo === 'true') ativo = true;
    if (req.query.ativo === 'false') ativo = false;
    // Sempre calculado a partir de quem está pedindo — não dá pra burlar
    // mandando (ou omitindo) um parâmetro na URL.
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
    const empresa = await service.getById(req.params.id);
    if (!empresa) return res.status(404).json({ message: 'Empresa não encontrada.' });
    await garantirEmpresaPermitida(req, empresa.id);
    res.json(empresa);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = empresaSchema.parse(req.body);
    const empresa = await service.create(data);
    res.status(201).json(empresa);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    if (err.code === '23505') return next(badRequest('Já existe uma empresa cadastrada com esse CNPJ.'));
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = updateSchema.parse(req.body);
    await garantirEmpresaPermitida(req, req.params.id);
    const empresa = await service.update(req.params.id, data);
    if (!empresa) return res.status(404).json({ message: 'Empresa não encontrada.' });
    res.json(empresa);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function setStatus(req, res, next) {
  try {
    const ativo = Boolean(req.body.ativo);
    await garantirEmpresaPermitida(req, req.params.id);
    const empresa = await service.setAtivo(req.params.id, ativo);
    if (!empresa) return res.status(404).json({ message: 'Empresa não encontrada.' });
    res.json(empresa);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await garantirEmpresaPermitida(req, req.params.id);
    const removed = await service.remove(req.params.id);
    if (!removed) return res.status(404).json({ message: 'Empresa não encontrada.' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { consultarCnpj, list, getById, create, update, setStatus, remove };
