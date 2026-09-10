const service = require('./cep.service');

async function consultarCep(req, res, next) {
  try {
    const data = await service.consultarCep(req.params.cep);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { consultarCep };
