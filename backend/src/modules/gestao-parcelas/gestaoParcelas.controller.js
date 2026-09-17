const { z } = require('zod');
const ExcelJS = require('exceljs');
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

// Mesmo preprocess acima, só que validando contra os 4 status de parcela —
// filtro "Tipo de Parcela" do topo da tela (ver GestaoCobrancasPage.jsx).
// Valor desconhecido/vazio é descartado em silêncio (vira "sem filtro"),
// nunca erro 400 — mesmo critério tolerante de costCenterIdsSchema.
const statusParcelaSchema = z.preprocess((val) => {
  if (val === undefined || val === '') return [];
  const bruto = Array.isArray(val) ? val : String(val).split(',');
  return bruto.filter((v) => service.STATUS_PARCELA_VALIDOS.includes(v));
}, z.array(z.enum(service.STATUS_PARCELA_VALIDOS)));

// Mesmo preprocess de costCenterIdsSchema — filtro "Responsável" do topo da
// tela, pelo `responsavel_usuario_id` da etapa atual de cada parcela.
const responsavelIdsSchema = z.preprocess((val) => {
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
    statusParcela: statusParcelaSchema.parse(query.status_parcela),
    responsavelIds: responsavelIdsSchema.parse(query.responsavel_ids),
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

// Colunas do Excel exportado — mesma ordem "empilhada" (Centro de Custo →
// Cliente → Título → Parcela) do relatório na tela, sem os níveis 1/2
// aparecerem à parte: 1 linha por parcela, com o Centro de Custo/Cliente
// repetidos em cada uma (pedido do usuário: "exportar um espelho deste
// relatório empilhado").
const EXPORT_COLUMNS = [
  { header: 'Centro de Custo', key: 'cost_center_name', width: 32 },
  { header: 'Cliente', key: 'client_name', width: 32 },
  { header: 'Título', key: 'bill_id', width: 12 },
  { header: 'Parcela', key: 'parcela', width: 28 },
  { header: 'Cluster', key: 'cluster_label', width: 16 },
  { header: 'Status', key: 'status_label', width: 16 },
  { header: 'Etapa', key: 'etapa_nome', width: 24 },
  { header: 'Responsável', key: 'responsavel_nome', width: 22 },
  { header: 'Vencimento', key: 'due_date_fmt', width: 14 },
  { header: 'Valor Pago', key: 'valor_pago', width: 16 },
  { header: 'Valor Vencido', key: 'valor_vencido', width: 16 },
  { header: 'Valor a Vencer', key: 'valor_a_vencer', width: 16 },
];

function formatarDataExport(data) {
  if (!data) return '';
  const d = new Date(data);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

async function exportarExcel(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const filtros = parseFiltros(req.query);
    const linhas = await service.listParaExportacao(empresaId, filtros);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Gestão das Parcelas');
    sheet.columns = EXPORT_COLUMNS;
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEFB' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'L1' };
    for (const key of ['valor_pago', 'valor_vencido', 'valor_a_vencer']) {
      sheet.getColumn(key).numFmt = '#,##0.00';
    }

    for (const linha of linhas) {
      sheet.addRow({ ...linha, due_date_fmt: formatarDataExport(linha.due_date) });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="gestao-parcelas-empresa-${empresaId}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
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
  exportarExcel,
  getEtapasPorCluster,
  listParcelas,
  listParcelasCliente,
};
