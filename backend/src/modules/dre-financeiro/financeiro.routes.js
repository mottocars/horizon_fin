const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDre } = require('../dre-versoes/contexto');
const controller = require('./financeiro.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versão da DRE do pedido (aberta / última salva / a visualizada) e a trava de gravação (dre-versoes/contexto.js).
router.param('empresaId', contextoDre('financeiro'));
router.get('/:empresaId/exercicios', controller.exercicios);
router.get('/:empresaId/exercicios/:ano/lancamentos', controller.lancamentos);
router.get('/:empresaId/exercicios/:ano/filtros', controller.filtros);

module.exports = router;
