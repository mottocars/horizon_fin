const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./dreCentros.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', controller.list);
// Antes de /:siengeId, senão "ordem" vira um id de centro.
router.put('/:empresaId/ordem', controller.reordenar);
router.put('/:empresaId/:siengeId', controller.update);

module.exports = router;
