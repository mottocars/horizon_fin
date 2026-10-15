const { z } = require('zod');
const service = require('./mcp.service');
const usuariosService = require('../usuarios/usuarios.service');
const oauth = require('./dfc/oauth.service');

// `escopo`: DFC_CONSTRUTORAS = flag "DFC CONSTRUTORAS" (só ferramentas do DFC, login Horizon que vale
// `sessao_horas`); DFC_ORCAMENTO = flag "DFC CONSTRUTORAS (ALTERA ORÇAMENTO)" (as mesmas, mais as que
// alteram valores HORIZON - INFORMADO do Orçamento); COBRANCA = o conector de cobrança de sempre.
const sessaoHoras = z.coerce.number().int().min(1, 'Duração mínima: 1 hora.').max(720, 'Duração máxima: 30 dias.');
const createSchema = z.object({
  empresa_id: z.coerce.number().int().positive('Selecione uma empresa.'),
  nome_conector: z.string().min(1, 'Nome do conector é obrigatório.'),
  escopo: z.enum(['COBRANCA', 'DFC_CONSTRUTORAS', 'DFC_ORCAMENTO']).default('COBRANCA'),
  sessao_horas: sessaoHoras.default(24),
});

const updateSchema = z.object({
  nome_conector: z.string().min(1, 'Nome do conector é obrigatório.'),
  sessao_horas: sessaoHoras.optional(),
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
    if (!item) return res.status(404).json({ message: 'Conector não encontrado.' });
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
    if (!item) return res.status(404).json({ message: 'Conector não encontrado.' });
    res.json(item);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function setStatus(req, res, next) {
  try {
    const ativo = Boolean(req.body.ativo);
    const item = await service.setAtivo(req.params.id, ativo);
    if (!item) return res.status(404).json({ message: 'Conector não encontrado.' });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function regenerarToken(req, res, next) {
  try {
    const item = await service.regenerarToken(req.params.id);
    if (!item) return res.status(404).json({ message: 'Conector não encontrado.' });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

// Conector DFC: sessões de login ativas (quem está conectado pelo Claude) e "Encerrar sessões".
async function sessoes(req, res, next) {
  try {
    res.json(await oauth.sessoesAtivas(Number(req.params.id)));
  } catch (err) {
    next(err);
  }
}

async function encerrarSessoes(req, res, next) {
  try {
    res.json({ encerradas: await oauth.encerrarSessoes(Number(req.params.id)) });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, setStatus, regenerarToken, sessoes, encerrarSessoes };
