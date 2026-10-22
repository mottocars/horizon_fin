const { z } = require('zod');
const service = require('./drePlanoContas.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Conta inválida.');
const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

const updateSchema = z.object({
  mascara_id: z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable()),
});

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// `centro` (query ou corpo): versão própria do centro de custo; sem ele, o plano Global.
const centroSchema = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? null : v),
  z.coerce.number().int().positive('Centro de custo inválido.').nullable()
);

function tratar(err, next) {
  if (err.issues) return next(erro(400, err.issues[0].message));
  return next(err);
}

async function list(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.list(empresaId, centroSchema.parse(req.query.centro)));
  } catch (err) {
    tratar(err, next);
  }
}

async function update(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const { mascara_id: mascaraId } = updateSchema.parse(req.body);
    const centroId = centroSchema.parse(req.body?.centro);
    res.json(await service.update(empresaId, siengeId, mascaraId, { centroId }));
  } catch (err) {
    tratar(err, next);
  }
}

async function listVersoes(req, res, next) {
  try {
    res.json(await service.listVersoes(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function criarVersao(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const centroId = z.coerce.number().int().positive('Escolha o centro de custo.').parse(req.body?.centro_id);
    // De onde começa o plano novo: 'global', 'branco' ou o id do centro cujo plano próprio copiar.
    const copiarDe = z
      .union([z.enum(['global', 'branco']), z.coerce.number().int().positive()], {
        errorMap: () => ({ message: 'Escolha se o plano começa em branco ou copiando outro plano.' }),
      })
      .parse(req.body?.copiar_de);
    if (copiarDe === centroId) throw erro(400, 'Escolha outro plano pra copiar.');
    res.status(201).json(await service.criarVersao(empresaId, centroId, req.user.id, copiarDe));
  } catch (err) {
    tratar(err, next);
  }
}

async function excluirVersao(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const centroId = z.coerce.number().int().positive('Centro de custo inválido.').parse(req.params.centroId);
    res.json(await service.excluirVersao(empresaId, centroId));
  } catch (err) {
    tratar(err, next);
  }
}

async function resumo(req, res, next) {
  try {
    res.json(await service.resumo(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, update, listVersoes, criarVersao, excluirVersao, resumo };
