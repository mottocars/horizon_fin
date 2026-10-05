const { z } = require('zod');
const service = require('./extratos.service');
const saldosService = require('../saldo-contas-bancarias/saldos.service');
const { agoraSP } = require('../monitor-integracoes/tempo');

const MAX_DIAS = 31;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto || '')) return false;
  const [ano, mes, dia] = texto.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

const querySchema = z.object({
  empresaId: z.coerce.number().int().positive('Selecione a empresa.'),
  // "1,2,3" -> [1, 2, 3]; vazio = todas as conexões da empresa.
  conexaoIds: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0) : [])),
  dataInicio: z.string().refine(dataValida, 'Informe a data inicial.'),
  dataFim: z.string().refine(dataValida, 'Informe a data final.'),
});

async function gerar(req, res, next) {
  try {
    const q = querySchema.parse(req.query);
    await saldosService.assertAcessoEmpresa(req.user.id, q.empresaId);
    if (q.dataInicio > q.dataFim) throw badRequest('A data inicial não pode ser depois da final.');
    if (q.dataFim > agoraSP().data) throw badRequest('A data final não pode ser no futuro.');
    const dias = Math.round((Date.parse(`${q.dataFim}T00:00:00Z`) - Date.parse(`${q.dataInicio}T00:00:00Z`)) / 86400000) + 1;
    if (dias > MAX_DIAS) throw badRequest(`O período pode ter no máximo ${MAX_DIAS} dias.`);
    res.json(await service.gerarRelatorio(q.empresaId, q));
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = { gerar };
