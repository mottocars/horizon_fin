const { z } = require('zod');
const service = require('./dfcSaldos.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');

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

// `?data=AAAA-MM-DD`: saldo na abertura desse dia.
async function saldos(req, res, next) {
  try {
    res.json(await service.saldos(empresaIdSchema.parse(req.params.empresaId), dataSchema.parse(req.query.data)));
  } catch (err) {
    tratar(err, next);
  }
}

// `?de=AAAA-MM&ate=AAAA-MM`: realizado do período (valores por centro × natureza × mês e saldos).
const mesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.');
async function realizado(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const de = mesSchema.parse(req.query.de);
    const ate = mesSchema.parse(req.query.ate);
    if (ate < de) throw erro(400, 'O mês final precisa ser igual ou depois do inicial.');
    res.json(await service.realizado(empresaId, de, ate));
  } catch (err) {
    tratar(err, next);
  }
}

async function base(req, res, next) {
  try {
    res.json({ base: await service.base(empresaIdSchema.parse(req.params.empresaId)) });
  } catch (err) {
    tratar(err, next);
  }
}

async function atualizarBase(req, res, next) {
  try {
    res.status(202).json(await service.atualizarBase(empresaIdSchema.parse(req.params.empresaId), req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

async function execucao(req, res, next) {
  try {
    res.json(await service.execucao(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { saldos, realizado, base, atualizarBase, execucao };
