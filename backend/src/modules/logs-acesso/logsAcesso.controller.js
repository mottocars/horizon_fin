const { z } = require('zod');
const service = require('./logsAcesso.service');

const registrarSchema = z.object({
  tela: z.string().min(1, 'Informe a tela.').max(120, 'Tela inválida.').regex(/^\//, 'Tela inválida.'),
});

const metricasQuerySchema = z
  .object({
    dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').optional(),
    dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').optional(),
  })
  .refine((data) => Boolean(data.dataInicio) === Boolean(data.dataFim), {
    message: 'Informe data de início e fim juntas.',
  });

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function registrar(req, res, next) {
  try {
    const data = registrarSchema.parse(req.body);
    const result = await service.registrar(req.user.id, data.tela);
    res.status(201).json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function metricas(req, res, next) {
  try {
    const query = metricasQuerySchema.parse(req.query);
    const result = await service.metricas(query);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = { registrar, metricas };
