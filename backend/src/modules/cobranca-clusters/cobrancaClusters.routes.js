const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./cobrancaClusters.controller');

const router = Router();

router.use(authMiddleware);
router.get('/resumo', controller.getResumo);
router.get('/resumo-centros-custo', controller.getResumoPorCentroCusto);
router.get('/cliente/:clientId', controller.getClienteDetalhe);
router.get('/:cluster', controller.listClientes);
router.post('/recalcular', controller.recalcular);

module.exports = router;
