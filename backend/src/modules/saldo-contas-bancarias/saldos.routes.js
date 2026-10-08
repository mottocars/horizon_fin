const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa, exigirAdministradorDaTela } = require('../../middlewares/acesso.middleware');
const T = require('../../config/telas');
const controller = require('./saldos.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId/filtros', controller.getFiltros);
router.get('/:empresaId/exportar-excel', controller.exportarExcel);
router.get('/:empresaId/periodo-aberto', controller.getPeriodoAberto);
router.put('/:empresaId/periodo-aberto', controller.abrirPeriodo);
router.delete('/:empresaId/periodo-aberto', controller.encerrarPeriodo);
router.post('/:empresaId/buscar-vanpix', controller.buscarVanpix);
// Aba Configurações: só o Administrador da tela (ou Master). A leitura de
// comunicar-saldos fica livre — o Encerrar Período mostra quem é avisado.
const soAdministrador = exigirAdministradorDaTela(T.SALDOS);
router.get('/:empresaId/comunicar-saldos', controller.getComunicarSaldos);
router.put('/:empresaId/comunicar-saldos', soAdministrador, controller.salvarComunicarSaldos);
// Rotinas (parâmetro "Gerar Rotinas" — ver rotinas.service.js)
router.get('/:empresaId/rotinas/config', soAdministrador, controller.getRotinasConfig);
router.put('/:empresaId/rotinas/config', soAdministrador, controller.salvarRotinasConfig);
router.get('/:empresaId/rotinas/status', controller.getRotinasStatus);
router.get('/:empresaId/rotinas/saldos', controller.getSaldosRotina);
router.put('/:empresaId/rotinas/saldos', controller.salvarSaldosRotina);
router.post('/:empresaId/rotinas/encerrar', controller.encerrarRotina);
router.delete('/:empresaId/rotinas/encerrar', controller.reabrirRotina);
router.get('/:empresaId', controller.getSaldos);
router.put('/:empresaId', controller.salvarSaldos);

module.exports = router;
