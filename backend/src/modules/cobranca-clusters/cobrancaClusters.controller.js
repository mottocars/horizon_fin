const { z } = require('zod');
const service = require('./cobrancaClusters.service');

const empresaIdSchema = z.coerce.number().int().positive('Selecione uma empresa.');
const clusterSchema = z.enum(['novo', 'bom', 'duvidoso', 'mau'], {
  errorMap: () => ({ message: 'Cluster inválido.' }),
});

// Aceita `?cost_center_ids=1,2,3` (string com vírgulas) ou `?cost_center_ids=1&cost_center_ids=2`
// — mesmo padrão do filtro de Centro de Custo dos Repasses CEF (ver
// repassesCef.controller.js::centroCustoIdsSchema).
const costCenterIdsSchema = z.preprocess((val) => {
  if (val === undefined || val === '') return [];
  const bruto = Array.isArray(val) ? val : String(val).split(',');
  return bruto.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
}, z.array(z.number().int().positive()));

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

function parseFiltros(query) {
  return {
    costCenterIds: costCenterIdsSchema.parse(query.cost_center_ids),
  };
}

async function recalcular(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.body.empresa_id);
    const resultado = await service.recalcularClusters(empresaId, req.user.id);
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function getResumo(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const filtros = parseFiltros(req.query);
    const resumo = await service.getResumo(empresaId, filtros);
    res.json(resumo);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function getResumoPorCentroCusto(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const filtros = parseFiltros(req.query);
    const resumo = await service.getResumoPorCentroCusto(empresaId, filtros);
    res.json(resumo);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listClientes(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const cluster = clusterSchema.parse(req.params.cluster);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const search = (req.query.search || '').toString();
    const filtros = parseFiltros(req.query);
    const resultado = await service.listClientesPorCluster(empresaId, cluster, { search, page, limit, ...filtros });
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function getClienteDetalhe(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const clientId = z.coerce.number().int().positive().parse(req.params.clientId);
    const resultado = await service.getClienteDetalhe(empresaId, clientId);
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = { recalcular, getResumo, getResumoPorCentroCusto, listClientes, getClienteDetalhe };
