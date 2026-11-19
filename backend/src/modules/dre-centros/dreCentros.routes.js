const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDre } = require('../dre-versoes/contexto');
const controller = require('./dreCentros.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versão da DRE do pedido (aberta / última salva / a visualizada) e a trava de gravação (dre-versoes/contexto.js).
router.param('empresaId', contextoDre('centros-custos'));
router.get('/:empresaId', controller.list);
// Antes de /:siengeId, senão "ordem" vira um id de centro.
router.put('/:empresaId/ordem', controller.reordenar);
router.put('/:empresaId/:siengeId', controller.update);

module.exports = router;
