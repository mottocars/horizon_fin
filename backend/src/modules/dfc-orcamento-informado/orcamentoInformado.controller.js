const { z } = require('zod');
const service = require('./orcamentoInformado.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const mesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.');
const idSchema = (rotulo) => z.coerce.number().int().positive(`${rotulo} inválido.`);
const valorSchema = z.coerce
  .number({ invalid_type_error: 'Valor inválido.' })
  .finite('Valor inválido.')
  .refine((v) => Math.abs(v) < 1e15, 'Valor grande demais.')
  .transform((v) => Math.round(v * 100) / 100);

const salvarSchema = z.object({
  centro_id: idSchema('Centro de custo'),
  sienge_id: idSchema('Conta'),
  mes: mesSchema,
  valor: z.union([z.null(), valorSchema]),
});

const replicarSchema = z.object({
  centro_id: idSchema('Centro de custo'),
  sienge_id: idSchema('Conta'),
  de: mesSchema,
  ate: mesSchema,
  valor: valorSchema,
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
    res.json(await service.list(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function salvar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.salvar(empresaId, salvarSchema.parse(req.body), req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

async function replicar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.replicar(empresaId, replicarSchema.parse(req.body), req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, salvar, replicar };
