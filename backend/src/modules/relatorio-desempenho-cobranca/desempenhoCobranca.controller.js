const { z } = require('zod');
const service = require('./desempenhoCobranca.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');

async function getDesempenho(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const dataInicio = dataSchema.parse(req.query.data_inicio);
    const dataFim = dataSchema.parse(req.query.data_fim);
    if (dataFim < dataInicio) return res.status(400).json({ message: 'A data final não pode ser anterior à data inicial.' });
    res.json(await service.getDesempenho(empresaId, { dataInicio, dataFim }));
  } catch (err) {
    if (err.issues) return res.status(400).json({ message: err.issues[0].message });
    next(err);
  }
}

module.exports = { getDesempenho };
