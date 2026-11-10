const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./cpr.controller');

// Cadastros › Contas Pagar / Receber (montado em /api/contas-pagar-receber, tela CONTAS_PAGAR_RECEBER).
const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId/opcoes', controller.opcoes);
router.get('/:empresaId/configuracoes', controller.obterConfiguracoes);
router.put('/:empresaId/configuracoes', controller.salvarConfiguracoes);
router.get('/:empresaId/titulos', controller.listar);
router.post('/:empresaId/titulos', controller.criar);
router.get('/:empresaId/titulos/:id', controller.obter);
router.put('/:empresaId/titulos/:id', controller.alterar);
router.delete('/:empresaId/titulos/:id', controller.excluir);
router.post('/:empresaId/parcelas/:parcelaId/baixa', controller.baixar);
router.delete('/:empresaId/parcelas/:parcelaId/baixa', controller.estornar);
router.get('/:empresaId/avanco-previsto/:centroId', controller.avancoPrevisto);
router.get('/:empresaId/documentos-pls/:centroId', controller.documentosPls);
router.get('/:empresaId/cabecalho-pls/:centroId', controller.cabecalhoPls);
router.get('/:empresaId/documentos-pls/:centroId/:tipo/:formato', controller.documentoPlsArquivo);

module.exports = router;
