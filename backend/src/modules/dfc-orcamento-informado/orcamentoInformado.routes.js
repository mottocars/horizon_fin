const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./orcamentoInformado.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', controller.list);
router.put('/:empresaId', controller.salvar);
router.post('/:empresaId/replicar', controller.replicar);

module.exports = router;
