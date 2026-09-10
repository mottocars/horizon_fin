const fs = require('fs');
const ExcelJS = require('exceljs');
const service = require('./dcd.service');

const COLS_CONTRATO = [
  { header: 'Arquivo', key: 'arquivo_original', width: 28 },
  { header: 'Emitente', key: 'emitente', width: 14 },
  { header: 'Contrato', key: 'numero_contrato', width: 18 },
  { header: 'Empreendimento', key: 'nome_empreendimento', width: 30 },
  { header: 'Origem de Recurso', key: 'origem_recurso', width: 16 },
  { header: 'Numero do Pedido', key: 'numero_pedido', width: 16 },
  { header: 'Codigo do Pedido', key: 'codigo_pedido', width: 16 },
  { header: 'Linha de Financiamento', key: 'linha_financiamento', width: 20 },
  { header: 'Numero do Empreendimento', key: 'numero_empreendimento', width: 22 },
  { header: 'Situacao do Pedido', key: 'situacao_pedido', width: 18 },
  { header: 'Tipo de Financiamento', key: 'tipo_financiamento', width: 18 },
  { header: 'Qtd Parcelas', key: 'quantidade_parcelas', width: 14 },
  { header: 'Dt Termino Suspensiva', key: 'data_termino_suspensiva', width: 18 },
  { header: 'Regencia de Critica', key: 'regencia_critica', width: 16 },
  { header: 'Numero do APF', key: 'numero_apf', width: 16 },
  { header: 'Dt Inicio Rot. Atraso Obra', key: 'data_inicio_rotina_atraso_obra', width: 20 },
  { header: 'Prazo de Obra Atual', key: 'prazo_obra_atual', width: 16 },
  { header: 'Cod Seguradora SGC', key: 'codigo_seguradora_sgc', width: 16 },
  { header: 'Apolice Seguro SGC', key: 'apolice_seguro_sgc', width: 16 },
  { header: 'Prazo de Obra Original', key: 'prazo_obra_original', width: 16 },
  { header: 'Cod Seguradora SRE', key: 'codigo_seguradora_sre', width: 16 },
  { header: 'Apolice Seguro SRE', key: 'apolice_seguro_sre', width: 16 },
  { header: '% Minimo de Obra', key: 'percentual_minimo_obra', width: 14 },
  { header: 'Cod Seguradora SGP', key: 'codigo_seguradora_sgp', width: 16 },
  { header: 'Apolice Seguro SGP', key: 'apolice_seguro_sgp', width: 16 },
  { header: 'Adiant/Defas Obra', key: 'adiantamento_defasagem_obra', width: 20 },
  { header: 'Cod Seguradora SGT', key: 'codigo_seguradora_sgt', width: 16 },
  { header: 'Apolice Seguro SGT', key: 'apolice_seguro_sgt', width: 16 },
  { header: 'Tipo Rotina', key: 'tipo_rotina', width: 18 },
  { header: 'Qtd Unidades', key: 'quantidade_unidades', width: 14 },
  { header: 'Qtd Unid Financiadas', key: 'quantidade_unidades_financiadas', width: 16 },
  { header: 'Qtd Unid Comercializadas', key: 'quantidade_unidades_comercializadas', width: 18 },
  { header: 'Vr Custo Obra', key: 'valor_custo_obra', width: 16 },
  { header: 'Total de Financiamento', key: 'total_financiamento', width: 18 },
  { header: 'Desp Leg Terr Financ', key: 'despesa_legal_terreno_financiamento', width: 18 },
  { header: 'Orcamento Compra/Venda', key: 'orcamento_compra_venda', width: 18 },
  { header: 'Total de FGTS', key: 'total_fgts', width: 16 },
  { header: 'Desp Leg Terr FGTS', key: 'despesa_legal_terreno_fgts', width: 16 },
  { header: 'Vr Compra/Venda Unidade', key: 'valor_compra_venda_unidade', width: 18 },
  { header: 'Total R.Proprio Mutuario', key: 'total_recurso_proprio_mutuario', width: 20 },
  { header: 'Desp Leg Terr R.Proprio', key: 'despesa_legal_terreno_recurso_proprio', width: 20 },
  { header: 'Vr Compra/Venda Terreno', key: 'valor_compra_venda_terreno', width: 18 },
  { header: '% Obra Executada', key: 'percentual_obra_executada', width: 14 },
  { header: 'Vr Financ Outro Agente', key: 'valor_financiamento_outro_agente', width: 18 },
  { header: 'Saldo Mutuario (PF)', key: 'saldo_mutuario_pf', width: 16 },
  { header: 'Data de Assinatura', key: 'data_assinatura', width: 16 },
  { header: 'Vr Terr Outro Agente', key: 'valor_terreno_outro_agente', width: 16 },
  { header: 'Saldo Aporte Construtora', key: 'saldo_aporte_construtora', width: 18 },
  { header: 'Dt Inicio Obra', key: 'data_inicio_obra', width: 14 },
  { header: 'Vr Aporte Construtora', key: 'valor_aporte_construtora', width: 18 },
  { header: 'Saldo Mutuario (PJ)', key: 'saldo_mutuario_pj', width: 16 },
  { header: 'Dt Termino Obra Original', key: 'data_termino_obra_original', width: 18 },
  { header: 'Vr Financiamento (PJ)', key: 'valor_financiamento_pj', width: 18 },
  { header: 'Saldo Devedor (PJ)', key: 'saldo_devedor_pj', width: 16 },
  { header: 'Dt Termino Obra Atual', key: 'data_termino_obra_atual', width: 18 },
  { header: 'Garantia Termino Obra', key: 'garantia_termino_obra', width: 18 },
  { header: 'Subsidio Res. 460', key: 'subsidio_resolucao_460', width: 16 },
  { header: 'Subsidio Convenios', key: 'subsidio_convenios', width: 16 },
  { header: 'Custo do Terreno', key: 'custo_terreno', width: 16 },
  { header: 'Total Suplementacao (PJ)', key: 'total_suplementacao_pj', width: 18 },
  { header: 'Maximo Lib. Geral (PJ)', key: 'maximo_liberacao_geral_pj', width: 18 },
  { header: 'Reducao Max Geral (PJ)', key: 'reducao_maxima_geral_pj', width: 18 },
  { header: 'Vr Min Garantia Hip(130%)', key: 'valor_minimo_garantia_hipotecaria', width: 20 },
  { header: 'Maximo Lib. Etapa (PJ)', key: 'maximo_liberacao_etapa_pj', width: 18 },
  { header: 'Reducao Max Etapa (PJ)', key: 'reducao_maxima_etapa_pj', width: 18 },
  { header: 'Recomposicao Etapa (PJ)', key: 'recomposicao_etapa_pj', width: 18 },
  { header: 'Amort. Recomp. Etapa(PJ)', key: 'amortizacao_recomposicao_etapa_pj', width: 20 },
  { header: 'Recomp. S/Reg Etapa (PJ)', key: 'recomposicao_sem_registro_etapa_pj', width: 20 },
  { header: '% Antec (PJ)', key: 'percentual_antecipacao_pj', width: 14 },
  { header: 'Vr Total Antec (PJ)', key: 'valor_total_antecipacao_pj', width: 16 },
];

const COLS_CRONO_FF = [
  { header: 'Contrato', key: 'numero_contrato', width: 18 },
  { header: 'Parcela', key: 'parcela', width: 10 },
  { header: 'Dt Parcela', key: 'data_parcela', width: 14 },
  { header: '% Etapa', key: 'percentual_etapa', width: 12 },
  { header: '% Acumulado', key: 'percentual_acumulado', width: 14 },
  { header: 'Compra/Venda', key: 'valor_compra_venda', width: 16 },
  { header: 'FGTS', key: 'valor_fgts', width: 14 },
  { header: 'RP Mutuario', key: 'valor_rp_mutuario', width: 14 },
  { header: 'RP Aportado', key: 'valor_rp_aportado', width: 14 },
  { header: 'Desconto', key: 'valor_desconto', width: 14 },
  { header: 'Financ Mut', key: 'valor_financiamento_mutuario', width: 14 },
  { header: 'RP Const', key: 'valor_rp_construtora', width: 14 },
  { header: 'Financ Const', key: 'valor_financiamento_construtora', width: 16 },
];

const COLS_CRONO_LIB = [
  { header: 'Contrato', key: 'numero_contrato', width: 18 },
  { header: 'Parcela', key: 'parcela', width: 10 },
  { header: 'Dt Parcela', key: 'data_parcela', width: 14 },
  { header: 'Status', key: 'status', width: 10 },
  { header: 'FGTS', key: 'fgts', width: 14 },
  { header: 'RP Mut.', key: 'rp_mutuario', width: 14 },
  { header: 'Desconto', key: 'desconto', width: 14 },
  { header: 'Financ Mut', key: 'financiamento_mutuario', width: 14 },
  { header: 'Aporte Const/CI', key: 'aporte_construtora_ci', width: 16 },
  { header: 'Aporte Terr', key: 'aporte_terreno', width: 14 },
  { header: 'Financ Const', key: 'financiamento_construtora', width: 16 },
  { header: 'Recomp. PJ', key: 'recomposicao_pj', width: 14 },
  { header: 'Remun.', key: 'remuneracao', width: 12 },
];

const COLS_DATA_CONTRATO = [
  'data_termino_suspensiva',
  'data_inicio_rotina_atraso_obra',
  'data_assinatura',
  'data_inicio_obra',
  'data_termino_obra_original',
  'data_termino_obra_atual',
];

const COLS_NUM_CONTRATO = [
  'percentual_minimo_obra',
  'valor_custo_obra',
  'total_financiamento',
  'despesa_legal_terreno_financiamento',
  'orcamento_compra_venda',
  'total_fgts',
  'despesa_legal_terreno_fgts',
  'valor_compra_venda_unidade',
  'total_recurso_proprio_mutuario',
  'despesa_legal_terreno_recurso_proprio',
  'valor_compra_venda_terreno',
  'percentual_obra_executada',
  'valor_financiamento_outro_agente',
  'saldo_mutuario_pf',
  'valor_terreno_outro_agente',
  'saldo_aporte_construtora',
  'valor_aporte_construtora',
  'saldo_mutuario_pj',
  'valor_financiamento_pj',
  'saldo_devedor_pj',
  'garantia_termino_obra',
  'subsidio_resolucao_460',
  'subsidio_convenios',
  'custo_terreno',
  'total_suplementacao_pj',
  'maximo_liberacao_geral_pj',
  'reducao_maxima_geral_pj',
  'valor_minimo_garantia_hipotecaria',
  'maximo_liberacao_etapa_pj',
  'reducao_maxima_etapa_pj',
  'recomposicao_etapa_pj',
  'amortizacao_recomposicao_etapa_pj',
  'recomposicao_sem_registro_etapa_pj',
  'percentual_antecipacao_pj',
  'valor_total_antecipacao_pj',
];

const COLS_NUM_CRONO_FF = [
  'percentual_etapa',
  'percentual_acumulado',
  'valor_compra_venda',
  'valor_fgts',
  'valor_rp_mutuario',
  'valor_rp_aportado',
  'valor_desconto',
  'valor_financiamento_mutuario',
  'valor_rp_construtora',
  'valor_financiamento_construtora',
];

const COLS_NUM_CRONO_LIB = [
  'fgts',
  'rp_mutuario',
  'desconto',
  'financiamento_mutuario',
  'aporte_construtora_ci',
  'aporte_terreno',
  'financiamento_construtora',
  'recomposicao_pj',
  'remuneracao',
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

function montarWorkbook(contratos, cronogramaFF, cronogramaLib) {
  const workbook = new ExcelJS.Workbook();

  const sheetContrato = workbook.addWorksheet('Cabecalho Contrato');
  sheetContrato.columns = COLS_CONTRATO;
  for (const c of contratos) {
    sheetContrato.addRow(numerizar(c, COLS_NUM_CONTRATO));
  }
  for (const col of COLS_DATA_CONTRATO) {
    sheetContrato.getColumn(col).numFmt = 'DD/MM/YYYY';
  }
  for (const col of COLS_NUM_CONTRATO) {
    sheetContrato.getColumn(col).numFmt = '#,##0.00';
  }
  aplicarCabecalho(sheetContrato);

  const sheetFF = workbook.addWorksheet('Cronograma Fisico Financeiro');
  sheetFF.columns = COLS_CRONO_FF;
  for (const p of cronogramaFF) {
    sheetFF.addRow(numerizar(p, COLS_NUM_CRONO_FF));
  }
  sheetFF.getColumn('data_parcela').numFmt = 'DD/MM/YYYY';
  for (const col of COLS_NUM_CRONO_FF) {
    sheetFF.getColumn(col).numFmt = '#,##0.00';
  }
  aplicarCabecalho(sheetFF);

  const sheetLib = workbook.addWorksheet('Cronograma de Liberacao');
  sheetLib.columns = COLS_CRONO_LIB;
  for (const p of cronogramaLib) {
    sheetLib.addRow(numerizar(p, COLS_NUM_CRONO_LIB));
  }
  sheetLib.getColumn('data_parcela').numFmt = 'DD/MM/YYYY';
  for (const col of COLS_NUM_CRONO_LIB) {
    sheetLib.getColumn(col).numFmt = '#,##0.00';
  }
  aplicarCabecalho(sheetLib);

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

async function listContratos(req, res, next) {
  try {
    const result = await service.listContratos(req.params.empresaId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function excluir(req, res, next) {
  try {
    const removido = await service.excluir(req.params.empresaId, req.params.numeroContrato);
    if (!removido) return res.status(404).json({ message: 'DCD não encontrado.' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

async function download(req, res, next) {
  try {
    const arquivo = await service.getArquivo(req.params.empresaId, req.params.numeroContrato);
    if (!arquivo) return res.status(404).json({ message: 'Arquivo não encontrado.' });
    res.download(arquivo.caminhoAbsoluto, arquivo.nomeOriginal);
  } catch (err) {
    next(err);
  }
}

async function exportExcel(req, res, next) {
  try {
    const dados = await service.getExportacao(req.params.empresaId, req.params.numeroContrato);
    if (!dados) return res.status(404).json({ message: 'Contrato não encontrado.' });

    const workbook = montarWorkbook([dados.contrato], dados.cronogramaFF, dados.cronogramaLib);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="DCD-${req.params.numeroContrato}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
}

async function exportExcelTodos(req, res, next) {
  try {
    const { contratos, cronogramaFF, cronogramaLib } = await service.getExportacaoTodos(req.params.empresaId);
    if (contratos.length === 0) {
      return res.status(404).json({ message: 'Nenhum DCD importado para esta empresa ainda.' });
    }

    const workbook = montarWorkbook(contratos, cronogramaFF, cronogramaLib);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="DCD-empresa-${req.params.empresaId}-todos.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
}

module.exports = { importar, listContratos, download, exportExcel, exportExcelTodos, excluir };
