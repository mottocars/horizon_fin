const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDfc } = require('../dfc-versoes/contexto');
const controller = require('./dfcParametros.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versões da DFC (dfc-versoes/contexto.js): lê a versão aberta, a escolhida no Visualizar (X-Dfc-Versao) ou a
// publicada; gravar só com a versão aberta.
router.param('empresaId', contextoDfc('parametros'));
router.get('/:empresaId/centros', controller.listCentros);
router.get('/:empresaId/centros/:siengeId/fonte', controller.getFonte);
router.get('/:empresaId/centros/:siengeId/versoes', controller.listVersoes);
router.get('/:empresaId/centros/:siengeId/versoes/:versao', controller.getVersao);
router.post('/:empresaId/centros/:siengeId/versoes', controller.criarVersao);

module.exports = router;
