const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./saldos.controller');

const router = Router();

router.use(authMiddleware);
router.get('/:empresaId/filtros', controller.getFiltros);
router.get('/:empresaId/periodo-aberto', controller.getPeriodoAberto);
router.put('/:empresaId/periodo-aberto', controller.abrirPeriodo);
router.delete('/:empresaId/periodo-aberto', controller.encerrarPeriodo);
router.post('/:empresaId/buscar-vanpix', controller.buscarVanpix);
router.get('/:empresaId', controller.getSaldos);
router.put('/:empresaId', controller.salvarSaldos);

module.exports = router;
