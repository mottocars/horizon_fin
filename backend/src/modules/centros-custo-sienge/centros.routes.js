const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./centros.controller');
const cronogramaController = require('../cronograma-centros/cronogramaCentros.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/', controller.listGerados);
router.get('/:empresaId/itens', controller.listItens);
router.get('/:empresaId/export', controller.exportExcel);
router.post('/gerar', controller.gerar);

router.get('/:empresaId/itens/:siengeId', controller.getItem);
router.put('/:empresaId/itens/:siengeId', controller.updateEnriquecimento);

router.get('/:empresaId/itens/:siengeId/etapas', controller.listEtapas);
router.post('/:empresaId/itens/:siengeId/etapas', controller.createEtapa);
router.put('/:empresaId/itens/:siengeId/etapas/:id', controller.updateEtapa);
router.delete('/:empresaId/itens/:siengeId/etapas/:id', controller.removeEtapa);
// Aba Histórico de Etapas: grava as datas como o cronograma de Cronogramas Obras (o mesmo dado —
// início de cada etapa, duração até a seguinte, fim calculado). Mesma função de lá, com a
// permissão desta tela.
router.put('/:empresaId/itens/:siengeId/cronograma', cronogramaController.updateDatas);

module.exports = router;
