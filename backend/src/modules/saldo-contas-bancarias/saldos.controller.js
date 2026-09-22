const { z } = require('zod');
const service = require('./saldos.service');

const MAX_DIAS_PERIODO = 93;
const MAX_ITENS_POR_LOTE = 3000;
// NUMERIC(15,2): 13 dígitos inteiros.
const SALDO_MAXIMO = 9_999_999_999_999.99;

const CLASSIFICACOES_VALIDAS = [
  'APLICACAO',
  'BLOQUEADA',
  'CHEQUE_ESPECIAL',
  'DEDICADA',
  'GARANTIDA',
  'LIBERADA',
  service.SEM_CLASSIFICACAO,
];

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// 'YYYY-MM-DD' que existe de verdade no calendário (rejeita 2026-02-31).
function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto || '')) return false;
  const [ano, mes, dia] = texto.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function diasEntre(inicio, fim) {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000) + 1;
}

// Filtros multi-valor chegam na query string separados por vírgula.
const csv = (val) =>
  (val ?? '')
    .toString()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');

const itemSchema = z.object({
  company_id: z.coerce.number().int().positive(),
  numero_conta: z.string().min(1).max(20),
  data: z.string().refine(dataValida, 'Data inválida.'),
  saldo: z
    .union([z.number(), z.string(), z.null()])
    .transform((v) => (v === null ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && Math.abs(v) <= SALDO_MAXIMO), 'Saldo inválido.')
    .transform((v) => (v === null ? null : Math.round(v * 100) / 100)),
});

const salvarSchema = z.object({
  itens: z.array(itemSchema).min(1, 'Nenhum saldo informado.').max(MAX_ITENS_POR_LOTE, 'Lote grande demais.'),
  // "Hoje" calculado no NAVEGADOR (não no servidor) — é o fallback usado quando a empresa
  // ainda não tem período aberto salvo; ver o comentário de getPeriodoAberto no service.
  hoje: z.string().refine(dataValida, 'Data inválida.'),
});

const abrirPeriodoSchema = z.object({
  data: z.string().refine(dataValida, 'Data inválida.'),
});

async function acessoEmpresa(req) {
  const empresaId = empresaIdSchema.parse(req.params.empresaId);
  await service.assertAcessoEmpresa(req.user.id, empresaId);
  return empresaId;
}

function tratarErroDeValidacao(err, next) {
  if (err.issues) return next(badRequest(err.issues[0].message));
  return next(err);
}

async function getFiltros(req, res, next) {
  try {
    const empresaId = await acessoEmpresa(req);
    res.json(await service.getFiltros(empresaId));
  } catch (err) {
    tratarErroDeValidacao(err, next);
  }
}

async function getSaldos(req, res, next) {
  try {
    const empresaId = await acessoEmpresa(req);

    const dataInicio = (req.query.data_inicio || '').toString();
    const dataFim = (req.query.data_fim || '').toString();
    if (!dataValida(dataInicio) || !dataValida(dataFim)) throw badRequest('Informe data início e data fim válidas.');
    if (dataFim < dataInicio) throw badRequest('A data fim não pode ser anterior à data início.');
    if (diasEntre(dataInicio, dataFim) > MAX_DIAS_PERIODO) {
      throw badRequest(`O período pode ter no máximo ${MAX_DIAS_PERIODO} dias.`);
    }

    const result = await service.getSaldos(empresaId, {
      dataInicio,
      dataFim,
      companyIds: csv(req.query.company_ids).map(Number).filter(Number.isInteger),
      classificacoes: csv(req.query.classificacoes).filter((c) => CLASSIFICACOES_VALIDAS.includes(c)),
      bancos: csv(req.query.bancos).filter((b) => /^\d{1,4}$/.test(b)),
    });
    res.json(result);
  } catch (err) {
    tratarErroDeValidacao(err, next);
  }
}

async function salvarSaldos(req, res, next) {
  try {
    const empresaId = await acessoEmpresa(req);
    const { itens, hoje } = salvarSchema.parse(req.body);
    res.json(await service.salvarSaldos(empresaId, req.user.id, itens, hoje));
  } catch (err) {
    tratarErroDeValidacao(err, next);
  }
}

async function getPeriodoAberto(req, res, next) {
  try {
    const empresaId = await acessoEmpresa(req);
    const hoje = (req.query.hoje || '').toString();
    if (!dataValida(hoje)) throw badRequest('Informe a data de hoje (do navegador).');
    res.json(await service.getPeriodoAberto(empresaId, hoje));
  } catch (err) {
    tratarErroDeValidacao(err, next);
  }
}

async function abrirPeriodo(req, res, next) {
  try {
    const empresaId = await acessoEmpresa(req);
    const { data } = abrirPeriodoSchema.parse(req.body);
    res.json(await service.abrirPeriodo(empresaId, req.user.id, data));
  } catch (err) {
    tratarErroDeValidacao(err, next);
  }
}

module.exports = { getFiltros, getSaldos, salvarSaldos, getPeriodoAberto, abrirPeriodo };
