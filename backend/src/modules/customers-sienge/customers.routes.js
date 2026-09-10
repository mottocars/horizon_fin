const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./customers.controller');

const router = Router();

router.use(authMiddleware);
router.get('/resumo', controller.getResumo);
router.get('/resumo-centro-custo', controller.getResumoPorCentroCusto);
router.get('/clientes-por-centro-custo', controller.listClientesPorCentroCusto);
router.get('/exportar', controller.exportExcel);
router.post('/sincronizar', controller.sincronizar);
router.put('/comunicar', controller.setComunicar);
router.put('/comunicar-centro-custo', controller.setComunicarCentroCusto);

module.exports = router;
