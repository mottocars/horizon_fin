const { z } = require('zod');
const service = require('./lancamentosManuais.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const idSchema = z.coerce.number().int().positive('Lançamento inválido.');

const lancamentoSchema = z.object({
  tipo: z.enum(['ENTRADA', 'SAIDA'], { errorMap: () => ({ message: 'Informe se é entrada ou saída.' }) }),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.'),
  documento: z.string().trim().max(50).optional().default(''),
  historico: z.string().trim().min(1, 'Informe o histórico.').max(255, 'Histórico com no máximo 255 caracteres.'),
  centro_id: z.coerce.number({ invalid_type_error: 'Escolha o centro de custo.' }).int().positive('Escolha o centro de custo.'),
  natureza_id: z.coerce.string().trim().min(1, 'Escolha a natureza.').max(20),
  valor: z.coerce.number({ invalid_type_error: 'Valor inválido.' }).positive('O valor precisa ser maior que zero.').max(1e13),
});

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

async function opcoes(req, res, next) {
  try {
    res.json(await service.opcoes(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function obter(req, res, next) {
  try {
    res.json(await service.obter(empresaIdSchema.parse(req.params.empresaId), idSchema.parse(req.params.id)));
  } catch (err) {
    tratar(err, next);
  }
}

async function criar(req, res, next) {
  try {
    res.status(201).json(await service.criar(empresaIdSchema.parse(req.params.empresaId), lancamentoSchema.parse(req.body || {}), req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

async function alterar(req, res, next) {
  try {
    res.json(
      await service.alterar(empresaIdSchema.parse(req.params.empresaId), idSchema.parse(req.params.id), lancamentoSchema.parse(req.body || {}), req.user.id)
    );
  } catch (err) {
    tratar(err, next);
  }
}

async function excluir(req, res, next) {
  try {
    res.json(await service.excluir(empresaIdSchema.parse(req.params.empresaId), idSchema.parse(req.params.id), req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { opcoes, obter, criar, alterar, excluir };
