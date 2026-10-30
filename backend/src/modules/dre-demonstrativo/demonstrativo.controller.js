const { z } = require('zod');
const service = require('./demonstrativo.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const dataSchema = (rotulo) => z.string({ required_error: `Informe a ${rotulo}.` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${rotulo} inválida.`);
const querySchema = z
  .object({
    de: dataSchema('data início'),
    ate: dataSchema('data fim'),
    // ?centro=1&centro=5 (ou centro[]=): vazio = todos os centros com "Realiza DRE".
    centro: z.preprocess((v) => (v === undefined ? [] : [].concat(v)), z.array(z.coerce.number().int().positive()).max(500)),
  })
  .refine((q) => q.de <= q.ate, { message: 'A data início não pode ser depois da data fim.' });

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

async function calcular(req, res, next) {
  try {
    const q = querySchema.parse({ ...req.query, centro: req.query.centro ?? req.query['centro[]'] });
    res.json(await service.calcular(empresaIdSchema.parse(req.params.empresaId), { de: q.de, ate: q.ate, centros: q.centro }));
  } catch (err) {
    if (err.issues) return next(erro(400, err.issues[0].message));
    return next(err);
  }
}

module.exports = { calcular };
