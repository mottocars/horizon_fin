const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./dfcContas.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', controller.list);
router.post('/:empresaId/sincronizar', controller.sincronizar);
router.put('/:empresaId/:companyId/:numeroConta', controller.update);

module.exports = router;
