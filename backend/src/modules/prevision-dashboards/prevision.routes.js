const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./prevision.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.post('/:empresaId/sincronizar', controller.sincronizar);
router.get('/:empresaId/projetos', controller.listarProjetos);

module.exports = router;
