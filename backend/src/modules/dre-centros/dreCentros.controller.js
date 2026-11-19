const { z } = require('zod');
const service = require('./dreCentros.service');
const c = require('../dre-versoes/carimbo');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');

const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

// Corpo parcial: só o que vier muda. `natureza` = o Tipo (Obra / Administrativo) — a MESMA coluna do
// cadastro que a aba Centros Custos da DFC grava (centros_custo_sienge.natureza): mudar aqui muda lá.
const updateSchema = z.object({
  realiza_dre: z.boolean({ invalid_type_error: 'Realiza DRE inválido.' }).optional(),
  natureza: z
    .preprocess(
      emptyToNull,
      z.enum(['OBRA', 'ADMINISTRATIVO'], { errorMap: () => ({ message: 'Escolha Obra ou Administrativo.' }) }).nullable()
    )
    .optional(),
});

const ordemSchema = z.object({
  ordem: z.array(z.coerce.number().int().positive('Centro de custo inválido.')).max(2000),
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

async function update(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const corpo = req.body || {};
    const dados = updateSchema.parse(corpo);
    const patch = {};
    if (dados.realiza_dre !== undefined) patch.realiza_dre = dados.realiza_dre;
    if ('natureza' in corpo) patch.natureza = dados.natureza ?? null;
    if (!Object.keys(patch).length) throw erro(400, 'Nada para alterar.');
    const antes = (await service.list(empresaId)).find((x) => Number(x.sienge_id) === siengeId);
    const item = await service.update(empresaId, siengeId, patch);
    if (!item) throw erro(404, 'Centro de custo não encontrado.');
    // Carimbo (aba Versões): um por campo — a natureza marca `campo` pra excluir a versão saber o que voltar.
    const rot = `${siengeId} - ${(item.apelido || '').trim() || item.name}`;
    if (antes && 'realiza_dre' in patch && Boolean(antes.realiza_dre) !== Boolean(item.realiza_dre)) {
      await c.carimbar(req, {
        descricao: `${rot}: Realiza DRE ${c.sn(antes.realiza_dre)} → ${c.sn(item.realiza_dre)}.`,
        detalhes: { centro_id: siengeId, campo: 'realiza_dre', antes: antes.realiza_dre, depois: item.realiza_dre },
      });
    }
    if (antes && 'natureza' in patch && (antes.natureza || null) !== (item.natureza || null)) {
      const tipo = c.rotulo('natureza');
      await c.carimbar(req, {
        descricao: `${rot}: Tipo ${tipo(antes.natureza)} → ${tipo(item.natureza)} (o Tipo é o mesmo da DFC).`,
        detalhes: { centro_id: siengeId, campo: 'natureza', antes: antes.natureza, depois: item.natureza },
      });
    }
    res.json(item);
  } catch (err) {
    tratar(err, next);
  }
}

async function reordenar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { ordem } = ordemSchema.parse(req.body || {});
    const antes = (await service.list(empresaId)).filter((x) => x.realiza_dre).map((x) => Number(x.sienge_id));
    const depois = await service.reordenar(empresaId, ordem);
    const naDre = depois.filter((x) => x.realiza_dre);
    if (antes.join(',') !== naDre.map((x) => Number(x.sienge_id)).join(',')) {
      await c.carimbar(req, {
        descricao: `Reordenou os centros de custo: ${naDre.map((x) => `${x.sienge_id} - ${(x.apelido || '').trim() || x.name}`).join(', ')}.`,
        detalhes: { antes, depois: naDre.map((x) => Number(x.sienge_id)) },
      });
    }
    res.json(depois);
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, update, reordenar };
