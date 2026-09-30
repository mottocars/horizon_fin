const { z } = require('zod');
const service = require('./monitor.service');
const executor = require('./executor');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function getPainel(req, res, next) {
  try {
    res.json(await service.getPainel(req.params.empresaId));
  } catch (err) {
    next(err);
  }
}

const agendamentoSchema = z
  .object({
    ativo: z.boolean(),
    frequencia: z.enum(['diaria', 'semanal', 'mensal'], { message: 'Escolha a frequência (diária, semanal ou mensal).' }),
    horario: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Informe um horário válido (HH:MM).'),
    diaSemana: z.coerce.number().int().min(0).max(6).nullish(),
    diaMes: z.coerce.number().int().min(1).max(31).nullish(),
  })
  .refine((d) => d.frequencia !== 'semanal' || d.diaSemana != null, { message: 'Escolha o dia da semana.' })
  .refine((d) => d.frequencia !== 'mensal' || d.diaMes != null, { message: 'Informe o dia do mês (1 a 31).' });

async function salvarAgendamento(req, res, next) {
  try {
    const dados = agendamentoSchema.parse(req.body);
    res.json(await service.salvarAgendamento(req.params.empresaId, req.params.rotina, dados, req.user.id));
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function executar(req, res, next) {
  try {
    await executor.iniciar(req.params.empresaId, req.params.rotina, { origem: 'manual', usuarioId: req.user.id });
    res.status(202).json(await service.getPainel(req.params.empresaId));
  } catch (err) {
    next(err);
  }
}

module.exports = { getPainel, salvarAgendamento, executar };
