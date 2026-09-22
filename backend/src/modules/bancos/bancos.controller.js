const { z } = require('zod');
const service = require('./bancos.service');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

const codigoSchema = z.string().regex(/^\d{3}$/, 'Código de banco inválido.');
const logoSchema = z.object({ logo: z.string().min(1, 'Envie uma imagem.') });

async function listar(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const search = (req.query.search || '').toString();
    res.json(await service.listarComPaginacao({ search, page, limit }));
  } catch (err) {
    next(err);
  }
}

async function salvarLogo(req, res, next) {
  try {
    const codigo = codigoSchema.parse(req.params.codigo);
    const { logo } = logoSchema.parse(req.body);
    await service.salvarLogo(codigo, logo);
    res.json({ ok: true });
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function removerLogo(req, res, next) {
  try {
    const codigo = codigoSchema.parse(req.params.codigo);
    await service.removerLogo(codigo);
    res.json({ ok: true });
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = { listar, salvarLogo, removerLogo };
