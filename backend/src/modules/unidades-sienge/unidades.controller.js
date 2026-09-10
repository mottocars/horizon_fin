const { z } = require('zod');
const service = require('./unidades.service');

const gerarSchema = z.object({
  empresa_id: z.coerce.number().int().positive('Selecione uma empresa.'),
});

const updateValorSchema = z.object({
  valor: z.coerce.number().nonnegative('Informe um valor válido.'),
});

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
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

async function listPorCentroCusto(req, res, next) {
  try {
    const result = await service.listPorCentroCusto(req.params.empresaId, req.params.siengeId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listCentrosComUnidades(req, res, next) {
  try {
    const result = await service.listCentrosComUnidades(req.params.empresaId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function updateValor(req, res, next) {
  try {
    const { valor } = updateValorSchema.parse(req.body);
    const result = await service.updateValor(req.params.empresaId, req.params.siengeUnitId, valor);
    if (!result) return res.status(404).json({ message: 'Unidade não encontrada.' });
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = { gerar, listPorCentroCusto, listCentrosComUnidades, updateValor };
