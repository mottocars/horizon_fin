const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./dreCentros.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', controller.list);
router.get('/:empresaId/contratos-caixa', controller.listContratosCaixa);
router.get('/:empresaId/projetos-prevision', controller.listProjetosPrevision);
router.put('/:empresaId/:siengeId', controller.update);

module.exports = router;
