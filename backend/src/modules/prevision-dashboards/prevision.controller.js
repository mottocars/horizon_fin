const service = require('./prevision.service');

async function sincronizar(req, res, next) {
  try {
    const result = await service.sincronizar(req.params.empresaId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listarProjetos(req, res, next) {
  try {
    const result = await service.listarProjetos(req.params.empresaId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { sincronizar, listarProjetos };
