const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./planos.controller');

const router = Router();

router.use(authMiddleware);
router.get('/', controller.listGerados);
router.get('/:empresaId/contas', controller.listContas);
router.post('/gerar', controller.gerar);

router.get('/:empresaId/contas/:siengeId', controller.getItem);
router.put('/:empresaId/contas/:siengeId', controller.updateEnriquecimento);
router.put('/:empresaId/contas/:siengeId/classificacao-dre', controller.updateClassificacaoDre);

module.exports = router;
