const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./dfcOrcamento.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', controller.orcamento);
router.get('/:empresaId/rascunho', controller.rascunho);
router.post('/:empresaId/versoes', controller.salvarVersao);
router.get('/:empresaId/log', controller.log);

module.exports = router;
