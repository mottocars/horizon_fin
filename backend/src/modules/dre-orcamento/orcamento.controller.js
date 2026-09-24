const { z } = require('zod');
const service = require('./orcamento.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');

// Aceita 'YYYY-MM-DD' (o <input type="date"> manda isso) e 'YYYY-MM' (o <input type="month">
// manda isso) — o serviço normaliza pro dia 1 de qualquer um dos dois.
const dataInicioSchema = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Data de início inválida.');

const salvarSchema = z.object({
  data_inicio: dataInicioSchema,
  itens: z
    .array(
      z.object({
        categoria_id: z.coerce.number().int().positive(),
        valor: z.coerce.number().finite('Valor inválido.'),
      })
    )
    .min(1, 'Informe ao menos uma categoria.'),
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

async function salvar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const { data_inicio, itens } = salvarSchema.parse(req.body);
    await service.salvar(empresaId, siengeId, data_inicio, itens);
    res.json(await service.listPorCentroCusto(empresaId, siengeId));
  } catch (err) {
    tratar(err, next);
  }
}

async function remover(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const dataInicio = dataInicioSchema.parse(req.params.dataInicio);
    const ok = await service.remover(empresaId, siengeId, dataInicio);
    if (!ok) throw erro(404, 'Orçamento não encontrado.');
    res.json({ ok: true });
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, salvar, remover };
