const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./unidades.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', controller.listar);
router.post('/:empresaId/sincronizar', controller.sincronizar);
router.post('/:empresaId/sincronizar-contratos', controller.sincronizarContratos);
router.get('/:empresaId/status-sincronizacao', controller.statusSincronizacao);

module.exports = router;
