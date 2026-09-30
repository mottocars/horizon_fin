const { z } = require('zod');
const service = require('./notasPendentes.service');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

const querySchema = z.object({
  empresaId: z.coerce.number().int().positive('Selecione a empresa.'),
  mesInicio: z.string().regex(MES, 'Informe o mês/ano inicial.'),
  mesFim: z.string().regex(MES, 'Informe o mês/ano final.'),
  // "1,2,3" (query string) -> [1, 2, 3]; vazio = todos os certificados.
  certificadoIds: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0) : [])),
});

async function listar(req, res, next) {
  try {
    const query = querySchema.parse(req.query);
    if (query.mesInicio > query.mesFim) throw badRequest('O mês/ano inicial não pode ser depois do final.');
    const result = await service.listNotasPendentes(query.empresaId, query);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = { listar };
