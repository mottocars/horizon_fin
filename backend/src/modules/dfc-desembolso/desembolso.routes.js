const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./desembolso.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', controller.listar);
router.get('/:empresaId/:siengeId', controller.obter);
router.post('/:empresaId/:siengeId/recalcular', controller.recalcular);

module.exports = router;
