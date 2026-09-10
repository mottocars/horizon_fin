const { z } = require('zod');
const service = require('./planos.service');

const emptyToUndefined = (val) => (val === '' || val === null || val === undefined ? undefined : val);
const nivelDigitosSchema = z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional());

const gerarSchema = z.object({
  empresa_id: z.coerce.number().int().positive('Selecione uma empresa.'),
  mascara_niveis: z.array(nivelDigitosSchema).min(1).max(7).optional(),
});

const emptyToNull = (val) => (val === '' || val === undefined ? null : val);

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const incrementoMensalShape = Object.fromEntries(
  MESES.map((mes) => [
    `incremento_${mes}`,
    z.preprocess(emptyToNull, z.coerce.number().nullable().optional()),
  ])
);

const enriquecimentoSchema = z.object({
  classificacao_dre_id: z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable().optional()),
  classificacao_dfc_id: z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable().optional()),
  submascara_dre_id: z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable().optional()),
  submascara_dfc_id: z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable().optional()),
  projeta_mes_atual_dfc: z.preprocess(emptyToNull, z.coerce.boolean().nullable().optional()),
  pacote_id: z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable().optional()),
  ...incrementoMensalShape,
  tipo_projecao: z.preprocess(
    emptyToNull,
    z.enum(['BASE_ZERO', 'ULTIMO_REALIZADO', 'MEDIA_ULTIMOS_MESES', 'REALIZADO_ANO_ANTERIOR']).nullable().optional()
  ),
  quantidade_meses: z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable().optional()),
  gera_orcamento: z.preprocess(emptyToNull, z.coerce.boolean().nullable().optional()),
  fonte_dados: z.preprocess(
    emptyToNull,
    z.enum(['SIENGE', 'CONTA_AZUL', 'PORTAL_CONSTRUTORAS']).nullable().optional()
  ),
  regra_calculo: z.preprocess(
    emptyToNull,
    z
      .enum([
        'FINANCEIRO',
        'ORCAMENTO_OBRAS',
        'ORCAMENTO_EMPRESARIAL',
        'REPASSE_CAIXA_PF',
        'NOVO_REGISTRO_PF',
        'MEDICAO_PF',
        'REPASSE_CAIXA_PJ',
        'AMORTIZACAO_PJ',
        'JUROS_PJ',
      ])
      .nullable()
      .optional()
  ),
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

module.exports = { listGerados, listContas, gerar, getItem, updateEnriquecimento };
