const { z } = require('zod');
const service = require('./dfcCentros.service');
const previsionService = require('../prevision-dashboards/prevision.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');

const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

// Os campos da aba, sempre juntos (a linha inteira vem do estado da tela). Contrato Caixa e
// Código Prevision são as MESMAS colunas do cadastro do centro de custo (Cadastros > Centros de
// Custos > Código Contrato Caixa / Código Prevision) — gravar aqui muda lá também.
const updateSchema = z.object({
  natureza: z.preprocess(
    emptyToNull,
    z.enum(['OBRA', 'ADMINISTRATIVO'], { errorMap: () => ({ message: 'Escolha Obra ou Administrativo.' }) }).nullable()
  ),
  projeta_dfc: z.boolean({ invalid_type_error: 'Projeta DFC inválido.' }).default(false),
  codigo_contrato_caixa: z.preprocess(emptyToNull, z.coerce.string().max(50).nullable()),
  codigo_prevision: z.preprocess(emptyToNull, z.coerce.string().max(50).nullable()),
});

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

function tratar(err, next) {
  if (err.issues) return next(erro(400, err.issues[0].message));
  return next(err);
}

async function list(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.list(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

async function listContratosCaixa(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.listContratosCaixa(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

// Mesma lista da combobox "Código Prevision" do cadastro do centro de custo (vem ao vivo da API
// do Prevision) — exposta aqui também pra quem só tem acesso à DFC.
async function listProjetosPrevision(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await previsionService.listarProjetos(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

async function update(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const dados = updateSchema.parse(req.body);
    const item = await service.update(empresaId, siengeId, dados);
    if (!item) throw erro(404, 'Centro de custo não encontrado.');
    res.json(item);
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, listContratosCaixa, listProjetosPrevision, update };
