const { z } = require('zod');
const ExcelJS = require('exceljs');
const service = require('./centros.service');

const FAIXA_LABELS = {
  FAIXA_1: 'Faixa 1',
  FAIXA_2: 'Faixa 2',
  FAIXA_3: 'Faixa 3',
  FAIXA_4: 'Faixa 4',
  SBPE: 'SBPE',
};

const EXPORT_COLUMNS = [
  { header: 'Código', key: 'sienge_id', width: 12 },
  { header: 'Descrição', key: 'name', width: 32 },
  { header: 'Nome Comercial', key: 'commercial_name', width: 28 },
  { header: 'CNPJ', key: 'cnpj', width: 20 },
  { header: 'Empresa', key: 'company_name', width: 40 },
  { header: 'Endereço', key: 'endereco', width: 40 },
  { header: 'Banco de Custo', key: 'cost_database_description', width: 20 },
  { header: 'Tipo de Edificação', key: 'building_type_description', width: 22 },
  { header: 'Status', key: 'status_label', width: 12 },
  { header: 'Apelido', key: 'apelido', width: 22 },
  { header: 'Unidade de Negócio', key: 'unidade_negocio_descricao', width: 22 },
  { header: 'Número de Unidades', key: 'numero_unidades', width: 18 },
  { header: 'Código Prevision', key: 'codigo_prevision', width: 18 },
  { header: 'Classificação de Orçamento', key: 'classificacao_orcamento_label', width: 22 },
  { header: 'Código Construtor de Vendas', key: 'codigo_construtor_vendas', width: 24 },
  { header: 'Código Contrato Caixa', key: 'codigo_contrato_caixa', width: 20 },
  { header: 'CEP', key: 'cep', width: 12 },
  { header: 'Cidade', key: 'cidade_enriquecida', width: 20 },
  { header: 'Estado', key: 'estado_enriquecido', width: 10 },
  { header: 'R$ Valor Geral de Vendas', key: 'valor_geral_vendas', width: 22 },
  { header: 'Faixa', key: 'faixa_label', width: 12 },
  { header: 'Data de Criação (Sienge)', key: 'data_criacao', width: 20 },
  { header: 'Data de Modificação (Sienge)', key: 'data_modificacao', width: 20 },
  { header: 'Atualizado em', key: 'atualizado_em_formatado', width: 20 },
];

const gerarSchema = z.object({
  empresa_id: z.coerce.number().int().positive('Selecione uma empresa.'),
});

const emptyToNull = (val) => (val === '' || val === undefined ? null : val);

const enriquecimentoSchema = z.object({
  status: z.enum(['ATIVO', 'INATIVO']).default('ATIVO'),
  apelido: z.preprocess(emptyToNull, z.string().max(150).nullable().optional()),
  unidade_negocio_id: z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable().optional()),
  numero_unidades: z.preprocess(emptyToNull, z.coerce.number().int().nullable().optional()),
  codigo_prevision: z.preprocess(emptyToNull, z.string().max(50).nullable().optional()),
  prevision_primary_view: z.coerce.boolean().default(true),
  codigo_construtor_vendas: z.preprocess(emptyToNull, z.string().max(50).nullable().optional()),
  codigo_contrato_caixa: z.preprocess(emptyToNull, z.string().max(50).nullable().optional()),
  cep: z.preprocess(emptyToNull, z.string().max(8).nullable().optional()),
  cidade_enriquecida: z.preprocess(emptyToNull, z.string().max(120).nullable().optional()),
  estado_enriquecido: z.preprocess(emptyToNull, z.string().max(2).nullable().optional()),
  valor_geral_vendas: z.preprocess(emptyToNull, z.coerce.number().nullable().optional()),
  faixa: z.preprocess(
    emptyToNull,
    z.enum(['FAIXA_1', 'FAIXA_2', 'FAIXA_3', 'FAIXA_4', 'SBPE']).nullable().optional()
  ),
});

const etapaSchema = z.object({
  mascara_item_id: z.coerce.number().int().positive('Selecione uma etapa.'),
  data_inicio: z.string().min(1, 'Data de início é obrigatória.'),
  data_fim: z.preprocess(emptyToNull, z.string().nullable().optional()),
});

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function listGerados(req, res, next) {
  try {
    const result = await service.listGerados();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listItens(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit, 10) || 15));
    const search = (req.query.search || '').toString();
    const result = await service.listItens(req.params.empresaId, { page, limit, search });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function exportExcel(req, res, next) {
  try {
    const itens = await service.listItensParaExportacao(req.params.empresaId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Centros de Custo');
    sheet.columns = EXPORT_COLUMNS;
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EEFB' },
    };

    for (const item of itens) {
      sheet.addRow({
        ...item,
        status_label: item.status === 'ATIVO' ? 'Ativo' : 'Inativo',
        faixa_label: item.faixa ? FAIXA_LABELS[item.faixa] || item.faixa : '',
        classificacao_orcamento_label: item.prevision_primary_view ? 'Primário' : 'Secundário',
        valor_geral_vendas: item.valor_geral_vendas !== null ? Number(item.valor_geral_vendas) : null,
        atualizado_em_formatado: item.atualizado_em
          ? new Date(item.atualizado_em).toLocaleString('pt-BR')
          : '',
      });
    }

    sheet.getColumn('valor_geral_vendas').numFmt = '#,##0.00';

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="centros-de-custo-empresa-${req.params.empresaId}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
}

async function gerar(req, res, next) {
  try {
    const { empresa_id } = gerarSchema.parse(req.body);
    const result = await service.gerar(empresa_id);
    res.status(201).json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function getItem(req, res, next) {
  try {
    const item = await service.getItem(req.params.empresaId, req.params.siengeId);
    if (!item) return res.status(404).json({ message: 'Centro de custo não encontrado.' });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function updateEnriquecimento(req, res, next) {
  try {
    const data = enriquecimentoSchema.parse(req.body);
    const item = await service.updateEnriquecimento(req.params.empresaId, req.params.siengeId, data);
    if (!item) return res.status(404).json({ message: 'Centro de custo não encontrado.' });
    res.json(item);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listEtapas(req, res, next) {
  try {
    const result = await service.listEtapas(req.params.empresaId, req.params.siengeId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createEtapa(req, res, next) {
  try {
    const data = etapaSchema.parse(req.body);
    const item = await service.createEtapa(req.params.empresaId, req.params.siengeId, data);
    res.status(201).json(item);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    if (err.code === '23503') return next(badRequest('Etapa selecionada não existe.'));
    next(err);
  }
}

async function updateEtapa(req, res, next) {
  try {
    const data = etapaSchema.parse(req.body);
    const item = await service.updateEtapa(
      req.params.id,
      req.params.empresaId,
      req.params.siengeId,
      data
    );
    if (!item) return res.status(404).json({ message: 'Etapa não encontrada.' });
    res.json(item);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function removeEtapa(req, res, next) {
  try {
    const removed = await service.removeEtapa(req.params.id, req.params.empresaId, req.params.siengeId);
    if (!removed) return res.status(404).json({ message: 'Etapa não encontrada.' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listGerados,
  listItens,
  exportExcel,
  gerar,
  getItem,
  updateEnriquecimento,
  listEtapas,
  createEtapa,
  updateEtapa,
  removeEtapa,
};
