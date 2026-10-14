const { z } = require('zod');
const service = require('./dfcRepasses.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');

async function list(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.repasses(empresaId));
  } catch (err) {
    if (err.issues) {
      const e = new Error(err.issues[0].message);
      e.status = 400;
      e.expose = true;
      return next(e);
    }
    next(err);
  }
}

module.exports = { list };
