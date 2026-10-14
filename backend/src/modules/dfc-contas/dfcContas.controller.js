const { z } = require('zod');
const service = require('./dfcContas.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const companyIdSchema = z.coerce.number().int().positive('Empresa da conta inválida.');
const numeroContaSchema = z.string().trim().min(1, 'Conta inválida.').max(20, 'Conta inválida.');
const updateSchema = z.object({ projeta_dfc: z.boolean({ required_error: 'Informe o Projeta DFC.' }) });

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

async function update(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const companyId = companyIdSchema.parse(req.params.companyId);
    const numeroConta = numeroContaSchema.parse(req.params.numeroConta);
    res.json(await service.update(empresaId, companyId, numeroConta, updateSchema.parse(req.body)));
  } catch (err) {
    tratar(err, next);
  }
}

async function sincronizar(req, res, next) {
  try {
    res.json(await service.sincronizar(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, update, sincronizar };
