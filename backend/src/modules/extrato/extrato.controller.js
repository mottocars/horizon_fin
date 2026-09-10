const fs = require('fs');
const ExcelJS = require('exceljs');
const service = require('./extrato.service');

const COLS_UNIDADES = [
  { header: 'Nome Empreendimento', key: 'nome_empreendimento', width: 28 },
  { header: 'Contrato Empreendimento', key: 'contrato_empreendimento', width: 20 },
  { header: 'Entidade Organizadora', key: 'entidade_organizadora', width: 26 },
  { header: 'CNPJ Entidade Organizadora', key: 'cnpj_entidade_organizadora', width: 20 },
  { header: 'Identificação do Empreendimento', key: 'identificacao_empreendimento', width: 22 },
  { header: 'APF', key: 'apf', width: 14 },
  { header: 'UF', key: 'unidade_federacao', width: 8 },
  { header: 'Município', key: 'municipio', width: 20 },
  { header: 'Tipo de Unidade', key: 'tipo_unidade', width: 16 },
  { header: 'Número Contrato Unidade', key: 'numero_contrato_unidade', width: 20 },
  { header: 'Nome Mutuário', key: 'nome_mutuario', width: 28 },
  { header: 'CPF/CNPJ Mutuário', key: 'cpf_cnpj_mutuario', width: 18 },
  { header: 'Data de Assinatura do contrato', key: 'data_assinatura_contrato', width: 18 },
  { header: 'Data de Inclusão dos Dados de Registro(CRI)', key: 'data_inclusao_dados_registro_cri', width: 20 },
  { header: 'Valor de Financiamento', key: 'valor_financiamento', width: 18 },
  { header: 'Valor de Financiamento do Terreno', key: 'valor_financiamento_terreno', width: 18 },
  {
    header: 'Valor de Desconto Subsídio Complementar',
    key: 'valor_desconto_subsidio_complementar',
    width: 20,
  },
  { header: 'Valor do FGTS', key: 'valor_fgts', width: 16 },
  { header: 'Valor Recursos Próprios', key: 'valor_recursos_proprios', width: 18 },
  { header: 'Valor de Compra e Venda', key: 'valor_compra_venda', width: 18 },
  { header: 'Valor de Avaliação do Imóvel', key: 'valor_avaliacao_imovel', width: 18 },
  { header: 'Fração Ideal', key: 'fracao_ideal', width: 14 },
  { header: 'Data Inicio Atraso Obra', key: 'data_inicio_atraso_obra', width: 18 },
  { header: 'Unidade Desligada', key: 'unidade_desligada', width: 14 },
];

const COLS_EVENTOS = [
  { header: 'Contrato Empreendimento', key: 'contrato_empreendimento', width: 20 },
  { header: 'Data', key: 'data_evento', width: 14 },
  { header: 'Origem', key: 'origem', width: 20 },
  { header: 'Evento', key: 'evento', width: 40 },
  { header: 'Parcela', key: 'parcela', width: 10 },
  { header: 'Valor', key: 'valor', width: 16 },
];

const COLS_DATA_UNIDADES = [
  'data_assinatura_contrato',
  'data_inclusao_dados_registro_cri',
  'data_inicio_atraso_obra',
];

const COLS_NUM_UNIDADES = [
  'valor_financiamento',
  'valor_financiamento_terreno',
  'valor_desconto_subsidio_complementar',
  'valor_fgts',
  'valor_recursos_proprios',
  'valor_compra_venda',
  'valor_avaliacao_imovel',
  'fracao_ideal',
];

function aplicarCabecalho(sheet) {
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEFB' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const totalCols = sheet.columns.length;
  const letra = (n) => {
    let s = '';
    let x = n;
    while (x > 0) {
      const rem = (x - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      x = Math.floor((x - 1) / 26);
    }
    return s;
  };
  sheet.autoFilter = { from: 'A1', to: `${letra(totalCols)}1` };
}

function numerizar(row, campos) {
  const out = { ...row };
  for (const campo of campos) {
    if (out[campo] !== null && out[campo] !== undefined) out[campo] = Number(out[campo]);
  }
  return out;
}

function montarWorkbook(unidades, cronograma, proximosEventos) {
  const workbook = new ExcelJS.Workbook();

  const sheetUnidades = workbook.addWorksheet('Unidades');
  sheetUnidades.columns = COLS_UNIDADES;
  for (const u of unidades) {
    sheetUnidades.addRow(numerizar(u, COLS_NUM_UNIDADES));
  }
  for (const col of COLS_DATA_UNIDADES) {
    sheetUnidades.getColumn(col).numFmt = 'DD/MM/YYYY';
  }
  for (const col of COLS_NUM_UNIDADES) {
    sheetUnidades.getColumn(col).numFmt = '#,##0.00';
  }
  aplicarCabecalho(sheetUnidades);

  const sheetCronograma = workbook.addWorksheet('Cronograma');
  sheetCronograma.columns = COLS_EVENTOS;
  for (const ev of cronograma) {
    sheetCronograma.addRow(numerizar(ev, ['valor']));
  }
  sheetCronograma.getColumn('data_evento').numFmt = 'DD/MM/YYYY';
  sheetCronograma.getColumn('valor').numFmt = '#,##0.00';
  aplicarCabecalho(sheetCronograma);

  const sheetProximos = workbook.addWorksheet('Proximos Eventos');
  sheetProximos.columns = COLS_EVENTOS;
  for (const ev of proximosEventos) {
    sheetProximos.addRow(numerizar(ev, ['valor']));
  }
  sheetProximos.getColumn('data_evento').numFmt = 'DD/MM/YYYY';
  sheetProximos.getColumn('valor').numFmt = '#,##0.00';
  aplicarCabecalho(sheetProximos);

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

    const result = await service.importarXls(
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
    const removido = await service.excluir(req.params.empresaId, req.params.contratoEmpreendimento);
    if (!removido) return res.status(404).json({ message: 'Empreendimento não encontrado.' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

async function download(req, res, next) {
  try {
    const arquivo = await service.getArquivo(req.params.empresaId, req.params.contratoEmpreendimento);
    if (!arquivo) return res.status(404).json({ message: 'Arquivo não encontrado.' });
    res.download(arquivo.caminhoAbsoluto, arquivo.nomeOriginal);
  } catch (err) {
    next(err);
  }
}

async function exportExcel(req, res, next) {
  try {
    const dados = await service.getExportacao(req.params.empresaId, req.params.contratoEmpreendimento);
    if (!dados) return res.status(404).json({ message: 'Empreendimento não encontrado.' });

    const workbook = montarWorkbook(dados.unidades, dados.cronograma, dados.proximosEventos);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Extrato-${req.params.contratoEmpreendimento}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
}

async function exportExcelTodos(req, res, next) {
  try {
    const { empreendimentos, unidades, cronograma, proximosEventos } = await service.getExportacaoTodos(
      req.params.empresaId
    );
    if (empreendimentos.length === 0) {
      return res.status(404).json({ message: 'Nenhum extrato importado para esta empresa ainda.' });
    }

    const workbook = montarWorkbook(unidades, cronograma, proximosEventos);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Extrato-empresa-${req.params.empresaId}-todos.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
}

module.exports = { importar, listEmpreendimentos, download, exportExcel, exportExcelTodos, excluir };
