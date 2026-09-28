const service = require('./relatorioMasa.service');

async function getFases(req, res, next) {
  try {
    const fases = await service.listFases();
    res.json(fases);
  } catch (err) {
    next(err);
  }
}

module.exports = { getFases };
