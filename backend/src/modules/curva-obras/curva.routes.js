const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./curva.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId/centros', controller.listCentros);
router.get('/:empresaId/:siengeId', controller.getCurva);
router.put('/:empresaId/:siengeId/calibragem', controller.salvarCalibragem);

module.exports = router;
