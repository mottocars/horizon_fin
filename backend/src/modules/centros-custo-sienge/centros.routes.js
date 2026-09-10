const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./centros.controller');

const router = Router();

router.use(authMiddleware);
router.get('/', controller.listGerados);
router.get('/:empresaId/itens', controller.listItens);
router.get('/:empresaId/export', controller.exportExcel);
router.post('/gerar', controller.gerar);

router.get('/:empresaId/itens/:siengeId', controller.getItem);
router.put('/:empresaId/itens/:siengeId', controller.updateEnriquecimento);

router.get('/:empresaId/itens/:siengeId/etapas', controller.listEtapas);
router.post('/:empresaId/itens/:siengeId/etapas', controller.createEtapa);
router.put('/:empresaId/itens/:siengeId/etapas/:id', controller.updateEtapa);
router.delete('/:empresaId/itens/:siengeId/etapas/:id', controller.removeEtapa);

module.exports = router;
