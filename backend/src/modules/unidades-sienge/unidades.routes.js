const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./unidades.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.post('/gerar', controller.gerar);
router.get('/:empresaId/centros', controller.listCentrosComUnidades);
router.get('/:empresaId/:siengeId', controller.listPorCentroCusto);
router.put('/:empresaId/unidade/:siengeUnitId', controller.updateValor);

module.exports = router;
