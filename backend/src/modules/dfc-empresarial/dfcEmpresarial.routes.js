const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./dfcEmpresarial.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', controller.base);
router.get('/:empresaId/valores', controller.valores);
router.get('/:empresaId/execucao', controller.execucao);
router.post('/:empresaId/atualizar', controller.atualizarBase);

module.exports = router;
