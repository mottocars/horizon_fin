const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDre } = require('../dre-versoes/contexto');
const controller = require('./drePlanoContas.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versão da DRE do pedido (aberta / última salva / a visualizada) e a trava de gravação (dre-versoes/contexto.js).
router.param('empresaId', contextoDre('plano-de-contas'));
router.get('/:empresaId', controller.list);
// Versões do plano por centro de custo — antes de '/:empresaId/:siengeId' (senão "versoes" seria conta).
router.get('/:empresaId/resumo', controller.resumo);
router.get('/:empresaId/excel', controller.exportarExcel);
router.get('/:empresaId/versoes', controller.listVersoes);
router.post('/:empresaId/versoes', controller.criarVersao);
router.delete('/:empresaId/versoes/:centroId', controller.excluirVersao);
router.put('/:empresaId/:siengeId', controller.update);

module.exports = router;
