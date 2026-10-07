const { z } = require('zod');
const service = require('./relatorioRepassesCef.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');

async function getMatriz(req, res, next) {
  try {
    const empresaId = empresaIdSchema.safeParse(req.params.empresaId);
    if (!empresaId.success) return res.status(400).json({ message: empresaId.error.issues[0].message });
    res.json(await service.getMatriz(empresaId.data));
  } catch (err) {
    next(err);
  }
}

module.exports = { getMatriz };
