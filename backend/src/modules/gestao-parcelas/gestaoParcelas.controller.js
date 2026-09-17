const { z } = require('zod');
const service = require('./gestaoParcelas.service');

const empresaIdSchema = z.coerce.number().int().positive('Selecione uma empresa.');
const clusterSchema = z.enum(service.CLUSTERS_VALIDOS, {
  errorMap: () => ({ message: 'Cluster inválido.' }),
});

// Mesmo preprocess de cobrancaClusters.controller.js::costCenterIdsSchema —
// aceita `?cost_center_ids=1,2,3` ou repetido (`...=1&...=2`).
const costCenterIdsSchema = z.preprocess((val) => {
  if (val === undefined || val === '') return [];
  const bruto = Array.isArray(val) ? val : String(val).split(',');
  return bruto.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
}, z.array(z.number().int().positive()));

// Etapa: sempre um id de regua_cobranca_etapas (inteiro positivo) — não
// existe mais bucket "Sem etapa" (parcela fora do range de todas as etapas
// configuradas nem entra na matriz, ver gestaoParcelas.service.js::
// buscarLinhasClassificadas).
const etapaIdSchema = z.coerce.number().int().positive('Etapa inválida.');
const clientIdSchema = z.coerce.number().int().positive('Cliente inválido.');
const costCenterIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');
const billIdSchema = z.coerce.number().int().positive('Título inválido.');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// `search` (nome do cliente) entra no mesmo `filtros` que `costCenterIds` —
// os 3 níveis do drilldown passam por buscarLinhasClassificadas, então um
// filtro aqui já refaz a matriz inteira (ver gestaoParcelas.service.js).
function parseFiltros(query) {
  return {
    costCenterIds: costCenterIdsSchema.parse(query.cost_center_ids),
    search: (query.search || '').toString(),
  };
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

async function listClientesPorCentroCusto(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const costCenterId = costCenterIdSchema.parse(req.params.costCenterId);
    const filtros = parseFiltros(req.query);
    const clientes = await service.listClientesPorCentroCusto(empresaId, costCenterId, filtros);
    res.json(clientes);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listParcelasPorTitulo(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const costCenterId = costCenterIdSchema.parse(req.params.costCenterId);
    const billId = billIdSchema.parse(req.params.billId);
    const filtros = parseFiltros(req.query);
    const parcelas = await service.listParcelasPorTitulo(empresaId, costCenterId, billId, filtros);
    res.json(parcelas);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function getEtapasPorCluster(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const cluster = clusterSchema.parse(req.params.cluster);
    const filtros = parseFiltros(req.query);
    const resultado = await service.getEtapasPorCluster(empresaId, cluster, filtros);
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listParcelas(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const cluster = clusterSchema.parse(req.params.cluster);
    const etapaId = etapaIdSchema.parse(req.params.etapaId);
    const filtros = parseFiltros(req.query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const resultado = await service.listParcelas(empresaId, cluster, etapaId, filtros, { page, limit });
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listParcelasCliente(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const cluster = clusterSchema.parse(req.params.cluster);
    const etapaId = etapaIdSchema.parse(req.params.etapaId);
    const clientId = clientIdSchema.parse(req.params.clientId);
    const filtros = parseFiltros(req.query);
    const parcelas = await service.listParcelasCliente(empresaId, cluster, etapaId, clientId, filtros);
    res.json(parcelas);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = {
  getResumoPorCentroCusto,
  listClientesPorCentroCusto,
  listParcelasPorTitulo,
  getEtapasPorCluster,
  listParcelas,
  listParcelasCliente,
};
