const { z } = require('zod');
const service = require('./contas.service');

const gerarSchema = z.object({
  empresa_id: z.coerce.number().int().positive('Selecione uma empresa.'),
});

const emptyToNull = (val) => (val === '' || val === undefined ? null : val);

const enriquecimentoSchema = z.object({
  banco_enriquecido: z.preprocess(emptyToNull, z.string().max(120).nullable().optional()),
  agencia_enriquecida: z.preprocess(emptyToNull, z.string().max(20).nullable().optional()),
  conta_enriquecida: z.preprocess(emptyToNull, z.string().max(20).nullable().optional()),
  digito: z.preprocess(emptyToNull, z.string().max(5).nullable().optional()),
  projeta_saldo: z.preprocess(emptyToNull, z.coerce.boolean().nullable().optional()),
  saldo_inicial: z.preprocess(emptyToNull, z.coerce.number().nullable().optional()),
  data_saldo_inicial: z.preprocess(emptyToNull, z.string().nullable().optional()),
});

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function listGerados(req, res, next) {
  try {
    const result = await service.listGerados();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listContas(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit, 10) || 15));
    const search = (req.query.search || '').toString();
    const result = await service.listContas(req.params.empresaId, { page, limit, search });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function gerar(req, res, next) {
  try {
    const { empresa_id } = gerarSchema.parse(req.body);
    const result = await service.gerar(empresa_id);
    res.status(201).json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function getItem(req, res, next) {
  try {
    const item = await service.getItem(req.params.empresaId, req.params.companyId, req.params.numeroConta);
    if (!item) return res.status(404).json({ message: 'Conta bancária não encontrada.' });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function updateEnriquecimento(req, res, next) {
  try {
    const data = enriquecimentoSchema.parse(req.body);
    const item = await service.updateEnriquecimento(
      req.params.empresaId,
      req.params.companyId,
      req.params.numeroConta,
      data
    );
    if (!item) return res.status(404).json({ message: 'Conta bancária não encontrada.' });
    res.json(item);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = { listGerados, listContas, gerar, getItem, updateEnriquecimento };
