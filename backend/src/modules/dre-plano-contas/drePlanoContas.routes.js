const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./drePlanoContas.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', controller.list);
// Versões do plano por centro de custo — antes de '/:empresaId/:siengeId' (senão "versoes" seria conta).
router.get('/:empresaId/resumo', controller.resumo);
router.get('/:empresaId/versoes', controller.listVersoes);
router.post('/:empresaId/versoes', controller.criarVersao);
router.delete('/:empresaId/versoes/:centroId', controller.excluirVersao);
router.put('/:empresaId/:siengeId', controller.update);

module.exports = router;
