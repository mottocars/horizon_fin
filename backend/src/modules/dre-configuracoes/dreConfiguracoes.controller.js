const { z } = require('zod');
const service = require('./dreConfiguracoes.service');
const c = require('../dre-versoes/carimbo');

// Carimbo (aba Versões) da troca de uma máscara da configuração.
async function carimbarMascara(req, rotulo, antesId, depoisId) {
  if ((antesId ?? null) === (depoisId ?? null)) return;
  const nomes = await c.nomesMascaras([antesId, depoisId]);
  const nome = (id) => (id ? c.txt(nomes.get(Number(id))) : '(nenhuma)');
  await c.carimbar(req, { descricao: `${rotulo}: ${nome(antesId)} → ${nome(depoisId)}.`, detalhes: { antes: antesId, depois: depoisId } });
}

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
// Máscara DRE Nível 2 da POC de Receita: obrigatória (sem ela a POC de Receita não é gerada).
const pocSchema = z.object({
  mascara_id: z.coerce
    .number({ invalid_type_error: 'Escolha a Máscara DRE Nível 2 da POC de Receita.' })
    .int()
    .positive('Escolha a Máscara DRE Nível 2 da POC de Receita.'),
});
// Linha de nível 1 da Avaliação Vertical: opcional (null = sem AV %).
const avSchema = z.object({
  mascara_id: z.coerce.number().int().positive('Linha de nível 1 inválida.').nullable(),
});
const documentosSchema = z.object({
  excluidos: z.array(z.string().trim().min(1).max(20)).max(500),
});
const condicoesSchema = z.object({
  excluidas: z.array(z.string().trim().min(1).max(20)).max(500),
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

async function obter(req, res, next) {
  try {
    res.json(await service.obter(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function salvarPocReceita(req, res, next) {
  try {
    const { mascara_id: mascaraId } = pocSchema.parse(req.body || {});
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const antes = await service.obter(empresaId);
    const r = await service.salvarPocReceita(empresaId, mascaraId, req.user.id);
    await carimbarMascara(req, 'Máscara DRE Nível 2 da POC de Receita', antes.poc_receita_mascara_id, r.poc_receita_mascara_id);
    res.json(r);
  } catch (err) {
    tratar(err, next);
  }
}

async function salvarAvaliacaoVertical(req, res, next) {
  try {
    const { mascara_id: mascaraId } = avSchema.parse({ mascara_id: req.body?.mascara_id ?? null });
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const antes = await service.obter(empresaId);
    const r = await service.salvarAvaliacaoVertical(empresaId, mascaraId, req.user.id);
    await carimbarMascara(req, 'Linha 100% da Análise Vertical (AV %)', antes.av_mascara_id, r.av_mascara_id);
    res.json(r);
  } catch (err) {
    tratar(err, next);
  }
}

async function salvarDocumentos(req, res, next) {
  try {
    const { excluidos } = documentosSchema.parse(req.body || {});
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const antes = new Set((await service.obter(empresaId)).excluidos);
    const r = await service.salvarDocumentos(empresaId, excluidos, req.user.id);
    const depois = new Set(r.excluidos);
    const saiu = [...depois].filter((d) => !antes.has(d));
    const voltou = [...antes].filter((d) => !depois.has(d));
    if (saiu.length || voltou.length) {
      const partes = [
        saiu.length ? `ficam fora da DRE: ${saiu.join(', ')}` : '',
        voltou.length ? `voltam para a DRE: ${voltou.join(', ')}` : '',
      ].filter(Boolean);
      await c.carimbar(req, { descricao: `Tipos de documento — ${partes.join('; ')}.`, detalhes: { saiu, voltou } });
    }
    res.json(r);
  } catch (err) {
    tratar(err, next);
  }
}

async function salvarCondicoes(req, res, next) {
  try {
    const { excluidas } = condicoesSchema.parse(req.body || {});
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const antes = new Set((await service.obter(empresaId)).condicoes_excluidas);
    const r = await service.salvarCondicoes(empresaId, excluidas, req.user.id);
    const depois = new Set(r.condicoes_excluidas);
    const saiu = [...depois].filter((d) => !antes.has(d));
    const voltou = [...antes].filter((d) => !depois.has(d));
    if (saiu.length || voltou.length) {
      const partes = [
        saiu.length ? `ficam fora da DRE: ${saiu.join(', ')}` : '',
        voltou.length ? `voltam para a DRE: ${voltou.join(', ')}` : '',
      ].filter(Boolean);
      await c.carimbar(req, { descricao: `Condições de pagamento (contratos) — ${partes.join('; ')}.`, detalhes: { saiu, voltou } });
    }
    res.json(r);
  } catch (err) {
    tratar(err, next);
  }
}

async function previaPoc(req, res, next) {
  try {
    res.json(await service.previaPoc(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { obter, salvarPocReceita, salvarAvaliacaoVertical, salvarDocumentos, salvarCondicoes, previaPoc };
