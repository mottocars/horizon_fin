const { z } = require('zod');
const service = require('./mascaras.service');

const TIPOS = [
  'DRE',
  'DFC',
  'PACOTES',
  'UNIDADES_NEGOCIO',
  'ETAPAS_CENTRO_CUSTO',
  'SUBMASCARA_DRE',
  'SUBMASCARA_DFC',
  'REPASSES',
];

// Macro etapas fixas dos Repasses (ver MascarasPage.jsx). Só o tipo REPASSES
// usa `grupo` — nos demais tipos ele é sempre '' (mascara "de nível único").
const GRUPOS_REPASSES = ['VENDA', 'CONTRATO', 'ASSINATURA', 'REGISTRO'];

const tipoSchema = z.enum(TIPOS, { errorMap: () => ({ message: 'Tipo de máscara inválido.' }) });
const empresaIdSchema = z.coerce.number().int().positive('Selecione uma empresa.');
const grupoSchema = z.string().optional().default('');

const listQuerySchema = z.object({
  tipo: tipoSchema,
  empresa_id: empresaIdSchema,
  grupo: grupoSchema,
});

const createSchema = z.object({
  tipo: tipoSchema,
  empresa_id: empresaIdSchema,
  grupo: grupoSchema,
});

const updateSchema = z.object({
  descricao: z.string().max(255).optional().default(''),
});

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

function resolveGrupo(tipo, rawGrupo) {
  if (tipo !== 'REPASSES') return '';
  if (!GRUPOS_REPASSES.includes(rawGrupo)) {
    throw badRequest('Macro etapa inválida.');
  }
  return rawGrupo;
}

async function list(req, res, next) {
  try {
    const { tipo, empresa_id: empresaId, grupo: rawGrupo } = listQuerySchema.parse(req.query);
    const grupo = resolveGrupo(tipo, rawGrupo);
    const result = await service.list(tipo, empresaId, grupo);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { tipo, empresa_id: empresaId, grupo: rawGrupo } = createSchema.parse(req.body);
    const grupo = resolveGrupo(tipo, rawGrupo);
    const item = await service.create(tipo, empresaId, grupo);
    res.status(201).json(item);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    if (err.code === '23503') return next(badRequest('Empresa selecionada não existe.'));
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { descricao } = updateSchema.parse(req.body);
    const item = await service.updateDescricao(req.params.id, descricao);
    if (!item) return res.status(404).json({ message: 'Item não encontrado.' });
    res.json(item);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const removed = await service.remove(req.params.id);
    if (!removed) return res.status(404).json({ message: 'Item não encontrado.' });
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') {
      return next(badRequest('Não é possível excluir: este item já está em uso em outro registro do sistema.'));
    }
    next(err);
  }
}

module.exports = { list, create, update, remove };
