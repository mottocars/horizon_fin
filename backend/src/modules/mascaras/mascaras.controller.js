const { z } = require('zod');
const service = require('./mascaras.service');

// DRE, DFC, SUBMASCARA_DRE e SUBMASCARA_DFC saíram em 26/11/2026 (pedido do usuário): a DRE Gerencial usa
// dre_mascaras e a DFC usa dfc_mascaras (database/migrations/2026-11-26-mascaras-responsavel.sql).
const TIPOS = ['PACOTES', 'PILARES', 'ETAPAS_CENTRO_CUSTO', 'REPASSES'];

// Pacotes e Pilares têm Responsável (usado na Gestão Matricial do dashboard Econômico/Financeiro).
const TIPOS_COM_RESPONSAVEL = ['PACOTES', 'PILARES'];

// Macro etapas fixas dos Repasses (ver MascarasPage.jsx). Só REPASSES usa `grupo` — nos
// demais tipos ele é sempre '' (mascara "de nível único").
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
  // Só usado pra tipo='REPASSES' — o front nem manda esse campo nos demais
  // tipos, então null é o padrão (sem SLA definido). z.null() precisa vir
  // ANTES do z.coerce.number() na union — coerce faria Number(null) virar 0
  // em vez de continuar null.
  sla_dias: z.union([z.null(), z.coerce.number().int().min(0, 'SLA não pode ser negativo.').max(3650)])
    .optional()
    .default(null),
  // Só Pacotes e Pilares. Ausente (undefined) = não mexe — quem não manda o campo (Repasses, aba antiga
  // aberta) não apaga o responsável; null = sem responsável.
  responsavel_id: z.union([z.null(), z.coerce.number().int().positive()]).optional(),
});

const responsaveisSchema = z.object({ empresa_id: empresaIdSchema });

// Pacotes e Pilares: criar várias (colar várias linhas) e reordenar (arrastar e soltar).
const tipoComResponsavelSchema = z.enum(TIPOS_COM_RESPONSAVEL, { errorMap: () => ({ message: 'Tipo de máscara inválido.' }) });
const loteSchema = z.object({
  tipo: tipoComResponsavelSchema,
  empresa_id: empresaIdSchema,
  descricoes: z.array(z.string().trim().min(1).max(255)).min(1, 'Informe o nome.').max(200),
});
const ordemSchema = z.object({
  tipo: tipoComResponsavelSchema,
  empresa_id: empresaIdSchema,
  ids: z.array(z.coerce.number().int().positive()).min(1),
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
    const { descricao, sla_dias: slaDias, responsavel_id: responsavelId } = updateSchema.parse(req.body);
    const atual = await service.get(req.params.id);
    if (!atual) return res.status(404).json({ message: 'Item não encontrado.' });
    let mudaResponsavel = false;
    if (responsavelId !== undefined && TIPOS_COM_RESPONSAVEL.includes(atual.tipo)) {
      mudaResponsavel = true;
      if (responsavelId && responsavelId !== atual.responsavel_id) {
        const responsaveis = await service.listResponsaveis(atual.empresa_id);
        if (!responsaveis.some((u) => u.id === responsavelId)) {
          throw badRequest('Responsável inválido: escolha um usuário ativo com acesso a esta empresa.');
        }
      }
    }
    const item = await service.update(req.params.id, { descricao, slaDias, mudaResponsavel, responsavelId: responsavelId || null });
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

// Quem pode ser Responsável de um Pacote ou Pilar: usuário ativo com a empresa no cadastro (mesma regra do
// Responsável das contas do plano financeiro).
async function responsaveis(req, res, next) {
  try {
    const { empresa_id: empresaId } = responsaveisSchema.parse(req.query);
    res.json(await service.listResponsaveis(empresaId));
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function createVarios(req, res, next) {
  try {
    const { tipo, empresa_id: empresaId, descricoes } = loteSchema.parse(req.body);
    res.status(201).json(await service.createVarios(tipo, empresaId, descricoes));
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function reordenar(req, res, next) {
  try {
    const { tipo, empresa_id: empresaId, ids } = ordemSchema.parse(req.body);
    res.json(await service.reordenar(tipo, empresaId, ids));
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = { list, create, createVarios, reordenar, update, remove, responsaveis };
