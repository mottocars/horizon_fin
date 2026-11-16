const { z } = require('zod');
const service = require('./dividaPj.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');
// 'AAAA-MM' (o <input type="month">) ou 'AAAA-MM-DD' — o serviço normaliza pro dia 1.
const mesSchema = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Mês inválido.');

const salvarSchema = z.object({
  mes: mesSchema,
  valor: z.coerce
    .number()
    .finite('Valor inválido.')
    .refine((v) => Math.abs(v) <= 9_999_999_999_999.99, 'Valor inválido.'),
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
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    res.json(await service.listPorCentroCusto(empresaId, siengeId));
  } catch (err) {
    tratar(err, next);
  }
}

async function vigentes(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.listVigentesPorEmpresa(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

// Devolve a lista do centro já atualizada (evita um GET logo depois de salvar).
async function salvar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const { mes, valor } = salvarSchema.parse(req.body);
    await service.salvar(empresaId, siengeId, mes, valor);
    res.json(await service.listPorCentroCusto(empresaId, siengeId));
  } catch (err) {
    tratar(err, next);
  }
}

async function remover(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const mes = mesSchema.parse(req.params.mes);
    const ok = await service.remover(empresaId, siengeId, mes);
    if (!ok) throw erro(404, 'Mês não encontrado.');
    res.json({ ok: true });
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, vigentes, salvar, remover };
