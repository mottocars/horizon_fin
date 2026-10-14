const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./projecaoCef.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId/elegiveis', controller.elegiveis);
router.get('/:empresaId/orcamento', controller.orcamento);
router.post('/:empresaId/:siengeId/atualizar', controller.atualizar);

module.exports = router;
