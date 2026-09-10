const { Router } = require('express');
const multer = require('multer');
const os = require('os');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./repassesCef.controller');

// Anexos de micro etapa: até 2MB cada, qualquer extensão (sem fileFilter),
// mesmo padrão de dcd.routes.js/certificados.routes.js.
const uploadMicroEtapa = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const router = Router();

router.use(authMiddleware);
router.get('/:empresaId/centros', controller.listCentros);
router.post('/:empresaId/sincronizar-reservas', controller.sincronizarReservas);
router.get('/:empresaId/reservas', controller.listReservas);
router.get('/:empresaId/filtros-reserva/opcoes', controller.listOpcoesFiltroReserva);
router.get('/:empresaId/filtros-reserva', controller.getFiltrosReserva);
router.put('/:empresaId/filtros-reserva', controller.salvarFiltrosReserva);
router.get('/:empresaId/cores-reserva', controller.getCoresReserva);
router.put('/:empresaId/cores-reserva', controller.salvarCoresReserva);
router.post('/:empresaId/sincronizar-contratos', controller.sincronizarContratos);
router.get('/:empresaId/contratos', controller.listContratos);
router.get('/:empresaId/assinaturas', controller.listAssinaturas);
router.get('/:empresaId/registros', controller.listRegistros);
router.get('/:empresaId/status-sincronizacao', controller.getStatusSincronizacao);
router.get('/:empresaId/ultimas-atualizacoes', controller.getUltimasAtualizacoes);
router.get('/:empresaId/exportar', controller.exportarExcel);
router.patch(
  '/:empresaId/contratos/:siengeContractId/numero-instituicao-financeira',
  controller.atualizarNumeroInstituicaoFinanceira
);
router.get('/:empresaId/historico', controller.getHistoricoEtapas);
router.get('/:empresaId/contratos/:siengeContractId/unidades-disponiveis', controller.listUnidadesDisponiveis);
router.post(
  '/:empresaId/historico-microetapas',
  uploadMicroEtapa.array('arquivos'),
  controller.registrarMovimentacaoMicroEtapa
);
router.get('/:empresaId/historico-microetapas/anexos/:anexoId/download', controller.downloadAnexoMicroEtapa);

module.exports = router;
