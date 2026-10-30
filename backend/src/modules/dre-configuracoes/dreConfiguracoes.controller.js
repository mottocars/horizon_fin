const { z } = require('zod');
const service = require('./dreConfiguracoes.service');

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
    res.json(await service.salvarPocReceita(empresaIdSchema.parse(req.params.empresaId), mascaraId, req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

async function salvarAvaliacaoVertical(req, res, next) {
  try {
    const { mascara_id: mascaraId } = avSchema.parse({ mascara_id: req.body?.mascara_id ?? null });
    res.json(await service.salvarAvaliacaoVertical(empresaIdSchema.parse(req.params.empresaId), mascaraId, req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

async function salvarDocumentos(req, res, next) {
  try {
    const { excluidos } = documentosSchema.parse(req.body || {});
    res.json(await service.salvarDocumentos(empresaIdSchema.parse(req.params.empresaId), excluidos, req.user.id));
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

module.exports = { obter, salvarPocReceita, salvarAvaliacaoVertical, salvarDocumentos, previaPoc };
