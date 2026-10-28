const { z } = require('zod');
const service = require('./mcp.service');
const usuariosService = require('../usuarios/usuarios.service');
const oauth = require('./dfc/oauth.service');
const { CODIGOS, normalizarModulos } = require('./modulos');

// `escopo`: HORIZON = conector com login do Horizon (vale `sessao_horas`) e as ferramentas dos `modulos`
// marcados (DFC, DFC_ORCAMENTO, SALDOS_CONTAS — ver modulos.js); COBRANCA = o conector de cobrança de
// sempre. Usuários liberados no conector (colaboradores da empresa; MASTER pode sempre).
const usuarioIds = z.array(z.coerce.number().int().positive()).max(500);
const sessaoHoras = z.coerce.number().int().min(1, 'Duração mínima: 1 hora.').max(720, 'Duração máxima: 30 dias.');
const createSchema = z.object({
  empresa_id: z.coerce.number().int().positive('Selecione uma empresa.'),
  nome_conector: z.string().min(1, 'Nome do conector é obrigatório.'),
  escopo: z.enum(['COBRANCA', 'HORIZON']).default('COBRANCA'),
  modulos: z.array(z.enum(CODIGOS)).default([]),
  sessao_horas: sessaoHoras.default(24),
  usuario_ids: usuarioIds.default([]),
});

// Na edição só os módulos mudam (conector Horizon, mesma URL). Cobrança tem outra URL e outro acesso —
// continua definida na criação.
const updateSchema = z.object({
  nome_conector: z.string().min(1, 'Nome do conector é obrigatório.'),
  sessao_horas: sessaoHoras.optional(),
  modulos: z.array(z.enum(CODIGOS)).optional(),
  usuario_ids: usuarioIds.optional(),
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
    if (data.escopo === 'HORIZON' && !data.modulos.length) throw badRequest('Marque ao menos um módulo.');
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
    const atual = await service.getById(req.params.id);
    if (!atual) return res.status(404).json({ message: 'Conector não encontrado.' });
    if (data.modulos && atual.escopo !== 'HORIZON') return next(badRequest('O conector de cobrança não tem módulos.'));
    if (data.modulos && !data.modulos.length) return next(badRequest('Marque ao menos um módulo.'));
    const trocaModulos = Boolean(data.modulos) && normalizarModulos(data.modulos).join() !== normalizarModulos(atual.modulos).join();
    const item = await service.update(req.params.id, data);
    // Mudou os módulos: encerra os logins ativos — quem estava conectado entra de novo e vê na tela de
    // login o que o conector passa a permitir.
    const sessoesEncerradas = trocaModulos ? await oauth.encerrarSessoes(atual.id) : 0;
    res.json({ ...item, sessoes_encerradas: sessoesEncerradas });
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

// Colaboradores da empresa que podem ser liberados num conector (formulário).
async function usuariosDisponiveis(req, res, next) {
  try {
    const empresaId = z.coerce.number().int().positive('Selecione uma empresa.').parse(req.query.empresa_id);
    res.json(await service.usuariosDaEmpresa(empresaId));
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

// "Conexões com IA" do usuário logado (qualquer usuário — ícone do topo).
async function minhasConexoes(req, res, next) {
  try {
    res.json(await service.minhasConexoes(req.user));
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, setStatus, regenerarToken, sessoes, encerrarSessoes, usuariosDisponiveis, minhasConexoes };
