const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./dfcAging.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// :tipo = receber | pagar
router.get('/:empresaId/:tipo', controller.aging);
router.get('/:empresaId/:tipo/execucao', controller.execucao);
router.post('/:empresaId/:tipo/atualizar', controller.atualizarBase);

module.exports = router;
