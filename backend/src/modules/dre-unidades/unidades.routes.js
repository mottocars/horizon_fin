const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDre } = require('../dre-versoes/contexto');
const controller = require('./unidades.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versão da DRE do pedido (aberta / última salva / a visualizada) e a trava de gravação (dre-versoes/contexto.js).
router.param('empresaId', contextoDre('unidades', { livre: (req) => /\/sincronizar/.test(req.path) }));
router.get('/:empresaId', controller.listar);
router.post('/:empresaId/sincronizar', controller.sincronizar);
router.post('/:empresaId/sincronizar-contratos', controller.sincronizarContratos);
router.get('/:empresaId/status-sincronizacao', controller.statusSincronizacao);

module.exports = router;
