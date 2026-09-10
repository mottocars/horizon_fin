const fs = require('fs');
const ExcelJS = require('exceljs');
const service = require('./epr.service');

const COLS_EMPREENDIMENTOS = [
  { header: 'Arquivo', key: 'arquivo_original', width: 28 },
  { header: 'Contrato Mestre (Obra)', key: 'contrato_mestre_obra', width: 20 },
  { header: 'Nome Empreendimento', key: 'nome_empreendimento', width: 32 },
  { header: 'UNO', key: 'uno', width: 12 },
  { header: 'Unidade Financeira', key: 'unidade_financeira', width: 18 },
  { header: 'Data Inicio Obra', key: 'data_inicio_obra', width: 16 },
  { header: 'Data Fim Obra', key: 'data_fim_obra', width: 16 },
  { header: 'Data Emissao Extrato', key: 'data_emissao_extrato', width: 18 },
  { header: 'Seguro SGC - Numero', key: 'seguro_sgc_numero', width: 26 },
  { header: 'Seguro SGC - Vigencia', key: 'seguro_sgc_vigencia', width: 18 },
  { header: 'Seguro SRE - Numero', key: 'seguro_sre_numero', width: 26 },
  { header: 'Seguro SRE - Vigencia', key: 'seguro_sre_vigencia', width: 18 },
  { header: 'Seguro SGP - Numero', key: 'seguro_sgp_numero', width: 26 },
  { header: 'Seguro SGP - Vigencia', key: 'seguro_sgp_vigencia', width: 18 },
  { header: 'Seguro SGT - Numero', key: 'seguro_sgt_numero', width: 26 },
  { header: 'Seguro SGT - Vigencia', key: 'seguro_sgt_vigencia', width: 18 },
  { header: 'Qtd. Mutuarios', key: 'quantidade_mutuarios', width: 16 },
];

const COLS_MUTUARIOS = [
  { header: 'Arquivo', key: 'arquivo_original', width: 28 },
  { header: 'Nome Empreendimento', key: 'nome_empreendimento', width: 32 },
  { header: 'Contrato Mestre (Obra)', key: 'contrato_mestre_obra', width: 20 },
  { header: 'Contrato Mutuario', key: 'contrato_mutuario', width: 18 },
  { header: 'Nome Mutuario', key: 'nome_mutuario', width: 28 },
  { header: 'UNO', key: 'uno', width: 10 },
  { header: 'ORR', key: 'orr', width: 8 },
  { header: 'TO', key: 'to_codigo', width: 6 },
  { header: 'COD', key: 'cod', width: 8 },
  { header: 'Data Assinatura', key: 'data_assinatura', width: 16 },
  { header: 'Tipo Unidade', key: 'tipo_unidade', width: 14 },
  { header: 'Garantia Automatica', key: 'garantia_automatica', width: 18 },
  { header: 'Data Inclusao Contrato', key: 'data_inclusao_contrato', width: 18 },
  { header: 'Data Inclusao Registro', key: 'data_inclusao_registro', width: 18 },
  { header: 'Valor Retido', key: 'valor_retido', width: 16 },
  { header: 'Valor Amortizado', key: 'valor_amortizado', width: 18 },
  { header: 'Amortizado', key: 'amortizado_label', width: 12 },
];

const COLS_DATA_EMPREENDIMENTO = [
  'data_inicio_obra',
  'data_fim_obra',
  'data_emissao_extrato',
  'seguro_sgc_vigencia',
  'seguro_sre_vigencia',
  'seguro_sgp_vigencia',
  'seguro_sgt_vigencia',
];

const COLS_DATA_MUTUARIO = ['data_assinatura', 'data_inclusao_contrato', 'data_inclusao_registro'];

function aplicarCabecalho(sheet) {
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8EEFB' },
  };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + sheet.columns.length)}1` };
}

function montarWorkbook(empreendimentos, mutuarios) {
  const workbook = new ExcelJS.Workbook();

  const sheetEmpreendimentos = workbook.addWorksheet('empreendimentos');
  sheetEmpreendimentos.columns = COLS_EMPREENDIMENTOS;
  for (const emp of empreendimentos) {
    sheetEmpreendimentos.addRow(emp);
  }
  for (const col of COLS_DATA_EMPREENDIMENTO) {
    sheetEmpreendimentos.getColumn(col).numFmt = 'DD/MM/YYYY';
  }
  aplicarCabecalho(sheetEmpreendimentos);

  const sheetMutuarios = workbook.addWorksheet('mutuarios');
  sheetMutuarios.columns = COLS_MUTUARIOS;
  for (const m of mutuarios) {
    sheetMutuarios.addRow({
      ...m,
      valor_retido: m.valor_retido !== null ? Number(m.valor_retido) : null,
      valor_amortizado: m.valor_amortizado !== null ? Number(m.valor_amortizado) : null,
      amortizado_label: m.amortizado ? 'SIM' : 'NAO',
    });
  }
  for (const col of COLS_DATA_MUTUARIO) {
    sheetMutuarios.getColumn(col).numFmt = 'DD/MM/YYYY';
  }
  sheetMutuarios.getColumn('valor_retido').numFmt = '#,##0.00';
  sheetMutuarios.getColumn('valor_amortizado').numFmt = '#,##0.00';
  aplicarCabecalho(sheetMutuarios);

  return workbook;
}

async function importar(req, res, next) {
  try {
    if (!req.file) {
      const err = new Error('Nenhum arquivo enviado.');
      err.status = 400;
      err.expose = true;
      throw err;
    }

    const result = await service.importarPdf(
      req.params.empresaId,
      req.file.path,
      req.file.originalname,
      req.user.id
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
}

async function listEmpreendimentos(req, res, next) {
  try {
    const result = await service.listEmpreendimentos(req.params.empresaId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function excluir(req, res, next) {
  try {
    const removido = await service.excluir(req.params.empresaId, req.params.contratoMestreObra);
    if (!removido) return res.status(404).json({ message: 'EPR não encontrado.' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

async function download(req, res, next) {
  try {
    const arquivo = await service.getArquivo(req.params.empresaId, req.params.contratoMestreObra);
    if (!arquivo) return res.status(404).json({ message: 'Arquivo não encontrado.' });
    res.download(arquivo.caminhoAbsoluto, arquivo.nomeOriginal);
  } catch (err) {
    next(err);
  }
}

async function exportExcel(req, res, next) {
  try {
    const dados = await service.getExportacao(req.params.empresaId, req.params.contratoMestreObra);
    if (!dados) return res.status(404).json({ message: 'Empreendimento não encontrado.' });

    const workbook = montarWorkbook([dados.empreendimento], dados.mutuarios);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="EPR-${req.params.contratoMestreObra}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
}

async function exportExcelTodos(req, res, next) {
  try {
    const { empreendimentos, mutuarios } = await service.getExportacaoTodos(req.params.empresaId);
    if (empreendimentos.length === 0) {
      return res.status(404).json({ message: 'Nenhum EPR importado para esta empresa ainda.' });
    }

    const workbook = montarWorkbook(empreendimentos, mutuarios);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="EPR-empresa-${req.params.empresaId}-todos.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
}

module.exports = { importar, listEmpreendimentos, download, exportExcel, exportExcelTodos, excluir };
