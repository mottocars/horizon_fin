const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./dfcParametros.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId/centros', controller.listCentros);
router.get('/:empresaId/centros/:siengeId/versoes', controller.listVersoes);
router.get('/:empresaId/centros/:siengeId/versoes/:versao', controller.getVersao);
router.post('/:empresaId/centros/:siengeId/versoes', controller.criarVersao);

module.exports = router;
