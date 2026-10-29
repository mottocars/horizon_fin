const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./correcoes.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', controller.listar);
router.get('/:empresaId/centros/:centroId/clientes/:clienteId/parcelas', controller.parcelas);

module.exports = router;
