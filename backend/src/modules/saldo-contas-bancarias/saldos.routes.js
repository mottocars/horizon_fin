const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./saldos.controller');

const router = Router();

router.use(authMiddleware);
router.get('/:empresaId/filtros', controller.getFiltros);
router.get('/:empresaId/exportar-excel', controller.exportarExcel);
router.get('/:empresaId/periodo-aberto', controller.getPeriodoAberto);
router.put('/:empresaId/periodo-aberto', controller.abrirPeriodo);
router.delete('/:empresaId/periodo-aberto', controller.encerrarPeriodo);
router.post('/:empresaId/buscar-vanpix', controller.buscarVanpix);
router.get('/:empresaId/comunicar-saldos', controller.getComunicarSaldos);
router.put('/:empresaId/comunicar-saldos', controller.salvarComunicarSaldos);
// Rotinas (parâmetro "Gerar Rotinas" — ver rotinas.service.js)
router.get('/:empresaId/rotinas/config', controller.getRotinasConfig);
router.put('/:empresaId/rotinas/config', controller.salvarRotinasConfig);
router.get('/:empresaId/rotinas/status', controller.getRotinasStatus);
router.get('/:empresaId/rotinas/saldos', controller.getSaldosRotina);
router.put('/:empresaId/rotinas/saldos', controller.salvarSaldosRotina);
router.post('/:empresaId/rotinas/encerrar', controller.encerrarRotina);
router.delete('/:empresaId/rotinas/encerrar', controller.reabrirRotina);
router.get('/:empresaId', controller.getSaldos);
router.put('/:empresaId', controller.salvarSaldos);

module.exports = router;
