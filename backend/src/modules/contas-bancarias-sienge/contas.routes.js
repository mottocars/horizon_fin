const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./contas.controller');

const router = Router();

router.use(authMiddleware);
router.get('/', controller.listGerados);
router.get('/:empresaId/contas', controller.listContas);
router.post('/gerar', controller.gerar);

router.get('/:empresaId/contas/:companyId/:numeroConta', controller.getItem);
router.put('/:empresaId/contas/:companyId/:numeroConta', controller.updateEnriquecimento);

module.exports = router;
