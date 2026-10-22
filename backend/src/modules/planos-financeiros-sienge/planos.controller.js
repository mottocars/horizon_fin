const { z } = require('zod');
const ExcelJS = require('exceljs');
const service = require('./planos.service');

const emptyToUndefined = (val) => (val === '' || val === null || val === undefined ? undefined : val);
const nivelDigitosSchema = z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional());

const gerarSchema = z.object({
  empresa_id: z.coerce.number().int().positive('Selecione uma empresa.'),
  mascara_niveis: z.array(nivelDigitosSchema).min(1).max(7).optional(),
});

const emptyToNull = (val) => (val === '' || val === undefined ? null : val);

// O cadastro da conta edita só Pacote e Responsável (ver service). responsavel_id não passa por
// emptyToNull de propósito: ausente (undefined) = não mexe; '' ou null = limpar.
const enriquecimentoSchema = z.object({
  pacote_id: z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable().optional()),
  responsavel_id: z.preprocess(
    (val) => (val === '' ? null : val),
    z.coerce.number().int().positive().nullable().optional()
  ),
});

const SIM_NAO = { S: 'Sim', N: 'Não' };

const EXPORT_COLUMNS = [
  { header: 'Código', key: 'codigo', width: 16 },
  { header: 'Descrição', key: 'name', width: 48 },
  { header: 'Totalizadora', key: 'totalizadora_label', width: 13 },
  { header: 'Status', key: 'status_label', width: 10 },
  { header: 'Redutora', key: 'redutora_label', width: 10 },
  { header: 'Adiantamento', key: 'adiantamento_label', width: 14 },
  { header: 'Imposto', key: 'imposto_label', width: 10 },
  { header: 'Pacote', key: 'pacote_descricao', width: 30 },
  { header: 'Responsável', key: 'responsavel_nome', width: 28 },
  { header: 'Atualizado em', key: 'atualizado_em_formatado', width: 20 },
];

// Código separado por pontos conforme a máscara do plano — mesma lógica de
// PlanoFinanceiroDetalhe.jsx::formatarCodigoMascara.
function codigoFormatado(conta) {
  const larguras = [1, 2, 3, 4, 5, 6, 7].map((n) => conta[`mascara_nivel_${n}`]);
  const digitos = String(conta.sienge_id);
  const segmentos = [];
  let pos = 0;
  for (const largura of larguras) {
    if (pos >= digitos.length) break;
    if (!largura) {
      if (segmentos.length > 0) segmentos[segmentos.length - 1] += digitos.slice(pos);
      pos = digitos.length;
      break;
    }
    segmentos.push(digitos.slice(pos, pos + largura));
    pos += largura;
  }
  if (pos < digitos.length && segmentos.length > 0) segmentos[segmentos.length - 1] += digitos.slice(pos);
  return segmentos.length > 0 ? segmentos.join('.') : digitos;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function listGerados(req, res, next) {
  try {
    const result = await service.listGerados(req.user.empresaIds ? [...req.user.empresaIds] : null);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listContas(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit, 10) || 15));
    const search = (req.query.search || '').toString();
    const result = await service.listContas(req.params.empresaId, { page, limit, search });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// Mesmo formato da exportação de Centros de Custo (centros.controller.js::exportExcel).
async function exportExcel(req, res, next) {
  try {
    const contas = await service.listContasParaExportacao(req.params.empresaId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Plano Financeiro');
    sheet.columns = EXPORT_COLUMNS;
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EEFB' },
    };

    for (const conta of contas) {
      sheet.addRow({
        ...conta,
        codigo: codigoFormatado(conta),
        totalizadora_label: conta.tp_conta === 'T' ? 'Sim' : 'Não',
        status_label: conta.fl_ativa === 'S' ? 'Ativa' : 'Inativa',
        redutora_label: SIM_NAO[conta.fl_redutora] || '',
        adiantamento_label: SIM_NAO[conta.fl_adiantamento] || '',
        imposto_label: SIM_NAO[conta.fl_imposto] || '',
        atualizado_em_formatado: conta.atualizado_em
          ? new Date(conta.atualizado_em).toLocaleString('pt-BR')
          : '',
      });
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="plano-financeiro-empresa-${req.params.empresaId}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
}

async function listResponsaveis(req, res, next) {
  try {
    res.json(await service.listResponsaveis(req.params.empresaId));
  } catch (err) {
    next(err);
  }
}

async function gerar(req, res, next) {
  try {
    const { empresa_id, mascara_niveis } = gerarSchema.parse(req.body);
    const result = await service.gerar(empresa_id, mascara_niveis);
    res.status(201).json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function getItem(req, res, next) {
  try {
    const item = await service.getItem(req.params.empresaId, req.params.siengeId);
    if (!item) return res.status(404).json({ message: 'Conta não encontrada.' });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function updateEnriquecimento(req, res, next) {
  try {
    const data = enriquecimentoSchema.parse(req.body);
    const item = await service.updateEnriquecimento(req.params.empresaId, req.params.siengeId, data);
    if (!item) return res.status(404).json({ message: 'Conta não encontrada.' });
    res.json(item);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = {
  listGerados,
  listContas,
  exportExcel,
  listResponsaveis,
  gerar,
  getItem,
  updateEnriquecimento,
};
