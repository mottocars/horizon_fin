const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDre } = require('../dre-versoes/contexto');
const controller = require('./lancamentosManuais.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versão da DRE do pedido (aberta / última salva / a visualizada) e a trava de gravação (dre-versoes/contexto.js).
router.param('empresaId', contextoDre('financeiro'));
// 'opcoes' antes de '/:empresaId/:id' (senão viraria id).
router.get('/:empresaId/opcoes', controller.opcoes);
router.post('/:empresaId', controller.criar);
router.get('/:empresaId/:id', controller.obter);
router.put('/:empresaId/:id', controller.alterar);
router.delete('/:empresaId/:id', controller.excluir);

module.exports = router;
