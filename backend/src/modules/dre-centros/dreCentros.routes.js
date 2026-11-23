const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDre } = require('../dre-versoes/contexto');
const controller = require('./dreCentros.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versão da DRE do pedido (aberta / última salva / a visualizada) e a trava de gravação (dre-versoes/contexto.js).
router.param('empresaId', contextoDre('centros-custos'));
router.get('/:empresaId', controller.list);
// As unidades da DRE (agrupadores + centros fora de agrupador) — filtros de centro da DRE e da Projeção.
router.get('/:empresaId/unidades', controller.unidades);
// Agrupadores (dre-agrupadores). Antes de /:siengeId, senão "agrupadores" / "ordem" viram um id de centro.
router.get('/:empresaId/agrupadores', controller.listAgrupadores);
router.post('/:empresaId/agrupadores', controller.criarAgrupador);
router.put('/:empresaId/agrupadores/:agrupadorId', controller.atualizarAgrupador);
router.delete('/:empresaId/agrupadores/:agrupadorId', controller.excluirAgrupador);
router.put('/:empresaId/ordem', controller.reordenar);
router.put('/:empresaId/:siengeId/agrupador', controller.moverCentro);
router.put('/:empresaId/:siengeId', controller.update);

module.exports = router;
