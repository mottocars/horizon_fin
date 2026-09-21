const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./saldos.controller');

const router = Router();

router.use(authMiddleware);
router.get('/:empresaId/filtros', controller.getFiltros);
router.get('/:empresaId', controller.getSaldos);
router.put('/:empresaId', controller.salvarSaldos);

module.exports = router;
