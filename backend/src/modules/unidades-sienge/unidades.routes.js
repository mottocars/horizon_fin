const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./unidades.controller');

const router = Router();

router.use(authMiddleware);
router.post('/gerar', controller.gerar);
router.get('/:empresaId/centros', controller.listCentrosComUnidades);
router.get('/:empresaId/:siengeId', controller.listPorCentroCusto);
router.put('/:empresaId/unidade/:siengeUnitId', controller.updateValor);

module.exports = router;
