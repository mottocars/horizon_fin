const { z } = require('zod');
const service = require('./titulosAjustes.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const origemSchema = z.enum(['R', 'P'], { errorMap: () => ({ message: 'Origem inválida (R = a receber, P = a pagar).' }) });
const billIdSchema = z.coerce.number().int().positive('Título inválido.');

// Linhas que substituem o rateio original: centro e natureza obrigatórios, valor positivo.
const ajusteSchema = z.object({
  linhas: z
    .array(
      z.object({
        centro_id: z.coerce.number({ invalid_type_error: 'Escolha o centro de custo.' }).int().positive('Escolha o centro de custo.'),
        natureza_id: z.coerce.string().trim().min(1, 'Escolha a natureza.').max(20),
        valor: z.coerce.number({ invalid_type_error: 'Valor inválido.' }).positive('O valor de cada linha precisa ser maior que zero.').max(1e13),
      })
    )
    .min(1, 'Informe ao menos uma linha.')
    .max(50, 'No máximo 50 linhas.'),
  observacao: z.string().trim().max(1000).optional().default(''),
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

function chave(req) {
  return [empresaIdSchema.parse(req.params.empresaId), origemSchema.parse(req.params.origem), billIdSchema.parse(req.params.billId)];
}

async function obter(req, res, next) {
  try {
    res.json(await service.obter(...chave(req)));
  } catch (err) {
    tratar(err, next);
  }
}

async function salvar(req, res, next) {
  try {
    res.json(await service.salvar(...chave(req), ajusteSchema.parse(req.body || {}), req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

async function restaurar(req, res, next) {
  try {
    res.json(await service.restaurar(...chave(req), req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { obter, salvar, restaurar };
