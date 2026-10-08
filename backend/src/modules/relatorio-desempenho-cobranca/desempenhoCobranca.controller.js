const { z } = require('zod');
const service = require('./desempenhoCobranca.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
// Janela de crédito: dias entre a última interação e o pagamento.
const janelaSchema = z.coerce.number().int().min(1, 'Janela inválida.').max(180, 'Janela de no máximo 180 dias.');

async function getDesempenho(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const dataInicio = dataSchema.parse(req.query.data_inicio);
    const dataFim = dataSchema.parse(req.query.data_fim);
    if (dataFim < dataInicio) return res.status(400).json({ message: 'A data final não pode ser anterior à data inicial.' });
    const janela = janelaSchema.parse(req.query.janela ?? 30);
    res.json(await service.getDesempenho(empresaId, { dataInicio, dataFim, janela }));
  } catch (err) {
    if (err.issues) return res.status(400).json({ message: err.issues[0].message });
    next(err);
  }
}

module.exports = { getDesempenho };
