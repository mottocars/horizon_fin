const { z } = require('zod');
const ExcelJS = require('exceljs');
const service = require('./customers.service');

const EXPORT_COLUMNS = [
  { header: 'Centro de Custo', key: 'cost_center_name', width: 32 },
  { header: 'Cliente', key: 'client_name', width: 36 },
  { header: 'CPF/CNPJ', key: 'documento', width: 20 },
  { header: 'Telefone', key: 'telefone', width: 18 },
  { header: 'E-mail', key: 'email', width: 30 },
  { header: 'Comunicar', key: 'comunicar_label', width: 12 },
];

const empresaIdSchema = z.coerce.number().int().positive('Selecione uma empresa.');
const costCenterIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');
const paginacaoSchema = z.object({
  search: z.string().optional().default(''),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});
const clientIdSchema = z.coerce.number().int().positive('Cliente inválido.');
const comunicarSchema = z.object({
  empresa_id: empresaIdSchema,
  client_id: clientIdSchema,
  comunicar: z.boolean(),
});
const comunicarCentroCustoSchema = z.object({
  empresa_id: empresaIdSchema,
  cost_center_id: costCenterIdSchema,
  comunicar: z.boolean(),
  search: z.string().optional().default(''),
});

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function sincronizar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.body.empresa_id);
    const resultado = await service.sincronizar(empresaId);
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function getResumo(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const resumo = await service.getResumo(empresaId);
    res.json(resumo);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function getResumoPorCentroCusto(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const costCenterIds = req.query.cost_center_ids
      ? String(req.query.cost_center_ids).split(',').filter(Boolean).map(Number)
      : [];
    const search = req.query.search ? String(req.query.search) : '';
    const resumo = await service.getResumoPorCentroCusto(empresaId, { costCenterIds, search });
    res.json(resumo);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listClientesPorCentroCusto(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const costCenterId = costCenterIdSchema.parse(req.query.cost_center_id);
    const { search, page, limit } = paginacaoSchema.parse(req.query);
    const resultado = await service.listClientesPorCentroCusto(empresaId, costCenterId, { search, page, limit });
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

// Excel da própria matriz Centro de Custo → Cliente da aba Clientes,
// respeitando o mesmo filtro de centro de custo e busca que estiverem
// ativos na tela no momento do clique (ver service.listClientesParaExportacao).
async function exportExcel(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const costCenterIds = req.query.cost_center_ids
      ? String(req.query.cost_center_ids).split(',').filter(Boolean).map(Number)
      : [];
    const search = req.query.search ? String(req.query.search) : '';
    const linhas = await service.listClientesParaExportacao(empresaId, { costCenterIds, search });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Clientes');
    sheet.columns = EXPORT_COLUMNS;
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEFB' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'F1' };
    sheet.getColumn('comunicar_label').alignment = { horizontal: 'center' };

    for (const linha of linhas) {
      sheet.addRow({
        cost_center_name: linha.cost_center_name || '',
        client_name: linha.name || '',
        documento: linha.cpf || linha.cnpj || '',
        telefone: linha.telefone || '',
        email: linha.email || '',
        comunicar_label: linha.comunicar ? 'Sim' : 'Não',
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="clientes-empresa-${empresaId}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function setComunicar(req, res, next) {
  try {
    const { empresa_id: empresaId, client_id: clientId, comunicar } = comunicarSchema.parse(req.body);
    const resultado = await service.setComunicar(empresaId, clientId, comunicar);
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function setComunicarCentroCusto(req, res, next) {
  try {
    const { empresa_id: empresaId, cost_center_id: costCenterId, comunicar, search } = comunicarCentroCustoSchema.parse(
      req.body
    );
    const resultado = await service.setComunicarCentroCusto(empresaId, costCenterId, comunicar, search);
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = {
  sincronizar,
  getResumo,
  getResumoPorCentroCusto,
  listClientesPorCentroCusto,
  exportExcel,
  setComunicar,
  setComunicarCentroCusto,
};
