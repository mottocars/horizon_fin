const { z } = require('zod');
const service = require('./comunicacao.service');

const empresaIdSchema = z.coerce.number().int().positive('Selecione uma empresa.');
// Mesmo vocabulário de cluster de regua-cobranca/reguaCobranca.service.js::CLUSTERS_VALIDOS
// — duplicado aqui de propósito (módulos independentes, sem acoplar um no outro).
const clusterSchema = z.enum(['novo', 'bom', 'duvidoso', 'mau', 'inad']);

const criarTemplateSchema = z.object({
  empresa_id: empresaIdSchema,
  nome: z.string().max(150).optional(),
  descricao: z.string().max(255).optional(),
  assunto: z.string().max(255).optional(),
  corpo: z.string().optional(),
  enviar_boleto: z.boolean().optional(),
  clusters: z.array(clusterSchema).optional(),
});

const atualizarTemplateSchema = z.object({
  nome: z.string().max(150).optional(),
  descricao: z.string().max(255).optional(),
  assunto: z.string().max(255).optional(),
  corpo: z.string().optional(),
  enviar_boleto: z.boolean().optional(),
  clusters: z.array(clusterSchema).optional(),
});

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function listTemplates(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const templates = await service.listTemplates(empresaId);
    res.json(templates);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function criarTemplate(req, res, next) {
  try {
    const { empresa_id: empresaId, ...dados } = criarTemplateSchema.parse(req.body);
    const template = await service.criarTemplate(empresaId, dados);
    res.status(201).json(template);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function atualizarTemplate(req, res, next) {
  try {
    const dados = atualizarTemplateSchema.parse(req.body);
    const template = await service.atualizarTemplate(req.params.id, dados);
    if (!template) return res.status(404).json({ message: 'Template não encontrado.' });
    res.json(template);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function removerTemplate(req, res, next) {
  try {
    const removido = await service.removerTemplate(req.params.id);
    if (!removido) return res.status(404).json({ message: 'Template não encontrado.' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listTemplates, criarTemplate, atualizarTemplate, removerTemplate };
