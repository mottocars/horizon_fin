const { z } = require('zod');
const service = require('./classificacoes.service');

const PRIORIDADES_VALIDAS = ['SALDO_ANTERIOR', 'SEM_SALDO'];

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const idSchema = z.coerce.number().int().positive('Classificação inválida.');

const corpoSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome da classificação.').max(50, 'Máximo de 50 caracteres.'),
  prioridade_sem_saldo: z.enum(PRIORIDADES_VALIDAS, { message: 'Selecione a prioridade quando não há saldo na API.' }),
  descricao: z
    .string()
    .trim()
    .max(1000, 'Descrição com no máximo 1000 caracteres.')
    .nullish()
    .transform((v) => v || null),
  libera_saldo: z.boolean({ message: 'Informe se o saldo dessa classificação é liberado ou bloqueado.' }),
});

function dados(body) {
  return {
    nome: body.nome,
    prioridadeSemSaldo: body.prioridade_sem_saldo,
    descricao: body.descricao,
    liberaSaldo: body.libera_saldo,
  };
}

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

function tratar(err, next) {
  if (err.issues) return next(erro(400, err.issues[0].message));
  return next(err);
}

async function list(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.list(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

async function create(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const body = corpoSchema.parse(req.body);
    res.status(201).json(await service.create(empresaId, dados(body)));
  } catch (err) {
    tratar(err, next);
  }
}

async function update(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = idSchema.parse(req.params.id);
    const body = corpoSchema.parse(req.body);
    const item = await service.update(id, empresaId, dados(body));
    if (!item) throw erro(404, 'Classificação não encontrada.');
    res.json(item);
  } catch (err) {
    tratar(err, next);
  }
}

async function remove(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = idSchema.parse(req.params.id);
    const ok = await service.remove(id, empresaId);
    if (!ok) throw erro(404, 'Classificação não encontrada.');
    res.json({ ok: true });
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, create, update, remove };
