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

// Macro etapas fixas dos Repasses (ver MascarasPage.jsx). Só REPASSES e DRE usam `grupo` — nos
// demais tipos ele é sempre '' (mascara "de nível único").
const GRUPOS_REPASSES = ['VENDA', 'CONTRATO', 'ASSINATURA', 'REGISTRO'];

// Nível 1 fixo da estrutura de DRE (ver frontend/src/config/estruturaDre.js — os dois têm que
// ficar em sincronia). Só os grupos que guardam itens de nível 2 entram aqui; os 4 subtotais
// calculados (RECEITA_LIQUIDA, LUCRO_BRUTO, EBITDA, LUCRO_LIQUIDO) não têm cadastro próprio.
const GRUPOS_DRE = ['RECEITA_BRUTA', 'IMPOSTOS_RECEITA', 'CIV', 'DESPESAS_OPERACIONAIS', 'DESPESAS_RECEITAS_NAO_OPERACIONAIS'];

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
  // Só usado pra tipo='REPASSES' — o front nem manda esse campo nos demais
  // tipos, então null é o padrão (sem SLA definido). z.null() precisa vir
  // ANTES do z.coerce.number() na union — coerce faria Number(null) virar 0
  // em vez de continuar null.
  sla_dias: z.union([z.null(), z.coerce.number().int().min(0, 'SLA não pode ser negativo.').max(3650)])
    .optional()
    .default(null),
});

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

function resolveGrupo(tipo, rawGrupo) {
  if (tipo === 'REPASSES') {
    if (!GRUPOS_REPASSES.includes(rawGrupo)) {
      throw badRequest('Macro etapa inválida.');
    }
    return rawGrupo;
  }
  if (tipo === 'DRE') {
    if (!GRUPOS_DRE.includes(rawGrupo)) {
      throw badRequest('Grupo da DRE inválido.');
    }
    return rawGrupo;
  }
  return '';
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
    const { descricao, sla_dias: slaDias } = updateSchema.parse(req.body);
    const item = await service.update(req.params.id, { descricao, slaDias });
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
