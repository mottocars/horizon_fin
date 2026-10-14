const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./dfcSaldos.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', controller.saldos);
router.get('/:empresaId/base', controller.base);
router.get('/:empresaId/realizado', controller.realizado);
router.get('/:empresaId/execucao', controller.execucao);
router.post('/:empresaId/atualizar', controller.atualizarBase);

module.exports = router;
