const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./cobrancaClusters.controller');

const router = Router();

router.use(authMiddleware);
router.get('/resumo', controller.getResumo);
router.get('/recalculo-info', controller.getRecalculoInfo);
router.get('/resumo-centros-custo', controller.getResumoPorCentroCusto);
router.get('/cliente/:clientId', controller.getClienteDetalhe);
router.get('/:cluster', controller.listClientes);
// Recalcular clusters: só pelo Monitor de Integrações (rotina 'cobranca_clusters').

module.exports = router;
