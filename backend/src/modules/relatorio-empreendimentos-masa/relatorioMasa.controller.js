const service = require('./relatorioMasa.service');
const { podeAcessarEmpresa } = require('../../middlewares/auth.middleware');

async function getMatriz(req, res, next) {
  try {
    // Relatório só da Masa: quem não tem a empresa MASA vinculada não vê.
    if (!podeAcessarEmpresa(req.user, await service.getEmpresaMasaId())) {
      return res.status(403).json({ message: 'Você não tem acesso a esta empresa.' });
    }
    const matriz = await service.listMatriz();
    res.json(matriz);
  } catch (err) {
    next(err);
  }
}

module.exports = { getMatriz };
