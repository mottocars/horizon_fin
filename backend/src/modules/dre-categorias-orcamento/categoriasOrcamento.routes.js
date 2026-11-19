const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDre } = require('../dre-versoes/contexto');
const controller = require('./categoriasOrcamento.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versão da DRE do pedido (aberta / última salva / a visualizada) e a trava de gravação (dre-versoes/contexto.js).
router.param('empresaId', contextoDre('orcamento'));
router.get('/:empresaId', controller.list);
router.post('/:empresaId', controller.create);
router.put('/:empresaId/:id', controller.update);
router.delete('/:empresaId/:id', controller.remove);

module.exports = router;
