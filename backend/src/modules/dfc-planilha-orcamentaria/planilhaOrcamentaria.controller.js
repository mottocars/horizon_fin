const { z } = require('zod');
const service = require('./planilhaOrcamentaria.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// GET /:empresaId/layout — o Excel da Planilha Orçamentária (base empilhada, travada).
async function layout(req, res, next) {
  try {
    const { buffer, nome } = await service.layout(empresaIdSchema.parse(req.params.empresaId), req.user.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="planilha-orcamentaria.xlsx"; filename*=UTF-8''${encodeURIComponent(nome)}`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    if (err.issues) return next(erro(400, err.issues[0].message));
    next(err);
  }
}

// POST /:empresaId/importar[?aplicar=1] — arquivo no campo "arquivo". Sem aplicar: prévia.
async function importar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    if (!req.file) throw erro(400, 'Envie o arquivo .xlsx da Planilha Orçamentária.');
    const aplicar = req.query.aplicar === '1' || req.query.aplicar === 'true';
    res.json(await service.importar(empresaId, { buffer: req.file.buffer, arquivo: req.file.originalname }, req.user.id, { aplicar }));
  } catch (err) {
    if (err.issues) return next(erro(400, err.issues[0].message));
    next(err);
  }
}

async function situacao(req, res, next) {
  try {
    res.json(await service.situacao(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    next(err);
  }
}

module.exports = { layout, importar, situacao };
