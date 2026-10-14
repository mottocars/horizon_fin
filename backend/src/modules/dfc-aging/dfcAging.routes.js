const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./dfcAging.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId/receber', controller.receber);
router.get('/:empresaId/receber/execucao', controller.execucao);
router.post('/:empresaId/receber/atualizar', controller.atualizarBase);

module.exports = router;
