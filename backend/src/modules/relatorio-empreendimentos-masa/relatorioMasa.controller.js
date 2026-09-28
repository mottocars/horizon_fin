const service = require('./relatorioMasa.service');

async function getMatriz(req, res, next) {
  try {
    const matriz = await service.listMatriz();
    res.json(matriz);
  } catch (err) {
    next(err);
  }
}

module.exports = { getMatriz };
