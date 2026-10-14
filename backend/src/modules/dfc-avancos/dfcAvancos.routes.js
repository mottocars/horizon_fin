const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./dfcAvancos.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', controller.list);
router.put('/:empresaId/:siengeId/manual', controller.salvarManual);

module.exports = router;
