const { z } = require('zod');
const service = require('./periodos.service');

const OPERACOES = ['CURVA_OBRAS', 'CURVA_VENDAS', 'PROJECOES_FINANCEIRAS'];

const createSchema = z
  .object({
    empresa_id: z.coerce.number().int().positive('Selecione uma empresa.'),
    data_inicio: z.string().min(1, 'Informe a data de início.'),
    data_fim: z.string().min(1, 'Informe a data fim.'),
    operacoes: z.array(z.enum(OPERACOES)).min(1, 'Selecione ao menos uma operação.'),
  })
  .refine((data) => data.data_inicio <= data.data_fim, {
    message: 'A data de início não pode ser posterior à data fim.',
    path: ['data_fim'],
  });

const updateSchema = z
  .object({
    data_inicio: z.string().min(1, 'Informe a data de início.'),
    data_fim: z.string().min(1, 'Informe a data fim.'),
    operacoes: z.array(z.enum(OPERACOES)).min(1, 'Selecione ao menos uma operação.'),
  })
  .refine((data) => data.data_inicio <= data.data_fim, {
    message: 'A data de início não pode ser posterior à data fim.',
    path: ['data_fim'],
  });

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function list(req, res, next) {
  try {
    const result = await service.list(req.query.empresaId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = createSchema.parse(req.body);
    const result = await service.create(data, req.user.id);
    res.status(201).json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = updateSchema.parse(req.body);
    const result = await service.update(req.params.id, data);
    if (!result) return res.status(404).json({ message: 'Período não encontrado.' });
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const removed = await service.remove(req.params.id);
    if (!removed) return res.status(404).json({ message: 'Período não encontrado.' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove, OPERACOES };
