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

const registroManualSchema = z.object({
  contrato: z.string().trim().min(1, 'Informe o contrato do empreendimento.').max(20),
  contratoUnidade: z.string().trim().min(1, 'Informe o contrato do cliente.').max(20),
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.')
    .nullable(),
});

async function salvarRegistroManual(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const dados = registroManualSchema.parse(req.body || {});
    res.json(await service.salvarRegistroManual(empresaId, dados, req.user.id));
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

module.exports = { list, salvarRegistroManual };
