const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDre } = require('../dre-versoes/contexto');
const controller = require('./dreConfiguracoes.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versão da DRE do pedido (aberta / última salva / a visualizada) e a trava de gravação (dre-versoes/contexto.js).
router.param('empresaId', contextoDre('configuracoes'));
router.get('/:empresaId', controller.obter);
router.get('/:empresaId/previa-poc', controller.previaPoc);
router.put('/:empresaId/poc-receita', controller.salvarPocReceita);
router.put('/:empresaId/avaliacao-vertical', controller.salvarAvaliacaoVertical);
router.put('/:empresaId/documentos', controller.salvarDocumentos);
router.put('/:empresaId/condicoes-pagamento', controller.salvarCondicoes);

module.exports = router;
