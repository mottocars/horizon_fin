const { z } = require('zod');
const service = require('./dfcCentros.service');
const previsionService = require('../prevision-dashboards/prevision.service');
const pool = require('../../config/db');
const { carimbar, mudancas, sn, txt, rotulo, rotuloCentro } = require('../dfc-versoes/carimbo');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');

const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

// Os campos da aba, sempre juntos (a linha inteira vem do estado da tela). Contrato Caixa e
// Código Prevision são as MESMAS colunas do cadastro do centro de custo (Cadastros > Centros de
// Custos > Código Contrato Caixa / Código Prevision) — gravar aqui muda lá também.
const updateSchema = z.object({
  natureza: z.preprocess(
    emptyToNull,
    z.enum(['OBRA', 'ADMINISTRATIVO'], { errorMap: () => ({ message: 'Escolha Obra ou Administrativo.' }) }).nullable()
  ),
  projeta_dfc: z.boolean({ invalid_type_error: 'Projeta DFC inválido.' }).default(false),
  codigo_contrato_caixa: z.preprocess(emptyToNull, z.coerce.string().max(50).nullable()),
  codigo_prevision: z.preprocess(emptyToNull, z.coerce.string().max(50).nullable()),
});

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

function tratar(err, next) {
  if (err.issues) return next(erro(400, err.issues[0].message));
  return next(err);
}

async function list(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.list(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

async function listContratosCaixa(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.listContratosCaixa(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

// Mesma lista da combobox "Código Prevision" do cadastro do centro de custo (vem ao vivo da API
// do Prevision) — exposta aqui também pra quem só tem acesso à DFC.
async function listProjetosPrevision(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await previsionService.listarProjetos(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

async function update(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const dados = updateSchema.parse(req.body);
    // Versões da DFC: o carimbo (aba Versões › Centros Custos). O centro antes, no public.
    const { rows: antes } = await pool.base.query(
      'SELECT natureza, projeta_dfc, codigo_contrato_caixa, codigo_prevision FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2',
      [empresaId, siengeId]
    );
    const item = await service.update(empresaId, siengeId, dados);
    if (!item) throw erro(404, 'Centro de custo não encontrado.');
    const partes = mudancas(antes[0], item, {
      natureza: ['Tipo', rotulo('natureza')],
      projeta_dfc: ['Projeta DFC', sn],
      codigo_contrato_caixa: ['Contrato Caixa', txt],
      codigo_prevision: ['Prevision', txt],
    });
    if (partes.length) {
      const mudouNatureza = antes[0] && String(antes[0].natureza ?? '') !== String(item.natureza ?? '');
      await carimbar(req, {
        descricao: `${await rotuloCentro(empresaId, siengeId)}: ${partes.join('; ')}.`,
        // `natureza` nos detalhes: a natureza (Tipo) mudada pela DFC volta ao excluir a versão (dfc-versoes/fotos.js).
        detalhes: { centro_id: siengeId, antes: antes[0] || null, depois: item, ...(mudouNatureza ? { natureza: { antes: antes[0].natureza, depois: item.natureza } } : {}) },
        chave: `centro:${siengeId}`,
      });
    }
    res.json(item);
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, listContratosCaixa, listProjetosPrevision, update };
