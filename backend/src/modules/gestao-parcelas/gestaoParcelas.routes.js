const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./gestaoParcelas.controller');

const router = Router();

router.use(authMiddleware);
router.get('/resumo-centros-custo', controller.getResumoPorCentroCusto);
router.get('/centros-custo/:costCenterId/clientes', controller.listClientesPorCentroCusto);
router.get('/:cluster/etapas', controller.getEtapasPorCluster);
router.get('/:cluster/etapas/:etapaId/parcelas', controller.listParcelas);
router.get('/:cluster/etapas/:etapaId/clientes/:clientId/parcelas', controller.listParcelasCliente);

module.exports = router;
