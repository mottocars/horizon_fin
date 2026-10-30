const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./dreConfiguracoes.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', controller.obter);
router.get('/:empresaId/previa-poc', controller.previaPoc);
router.put('/:empresaId/poc-receita', controller.salvarPocReceita);
router.put('/:empresaId/documentos', controller.salvarDocumentos);

module.exports = router;
