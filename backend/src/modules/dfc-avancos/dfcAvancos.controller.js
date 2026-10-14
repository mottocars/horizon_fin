const { z } = require('zod');
const service = require('./dfcAvancos.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const dataSchema = (rotulo) => z.string({ required_error: `Informe a ${rotulo}.` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${rotulo} inválida.`);

const querySchema = z
  .object({ inicio: dataSchema('Data início'), fim: dataSchema('Data fim') })
  .refine((q) => q.fim >= q.inicio, { message: 'A Data fim precisa ser igual ou depois da Data início.' })
  .refine((q) => Number(q.fim.slice(0, 4)) - Number(q.inicio.slice(0, 4)) <= 10, {
    message: 'Período de no máximo 10 anos.',
  });

const manualSchema = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.'),
  percentual: z.union([
    z.null(),
    z.coerce.number().min(0, 'O avanço não pode ser negativo.').max(100, 'O avanço não pode passar de 100%.'),
  ]),
});

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

async function list(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { inicio, fim } = querySchema.parse(req.query);
    res.json(await service.avancos(empresaId, inicio, fim));
  } catch (err) {
    if (err.issues) return next(erro(400, err.issues[0].message));
    next(err);
  }
}

async function salvarManual(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = z.coerce.number().int().positive('Centro de custo inválido.').parse(req.params.siengeId);
    const { mes, percentual } = manualSchema.parse(req.body);
    res.json(await service.salvarManual(empresaId, siengeId, mes, percentual === null ? null : Math.round(percentual * 100) / 100, req.user.id));
  } catch (err) {
    if (err.issues) return next(erro(400, err.issues[0].message));
    next(err);
  }
}

module.exports = { list, salvarManual };
