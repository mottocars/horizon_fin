const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDfc } = require('../dfc-versoes/contexto');
const controller = require('./dfcPlanoContas.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versões da DFC (dfc-versoes/contexto.js): lê a versão aberta, a escolhida no Visualizar (X-Dfc-Versao) ou a
// publicada; gravar só com a versão aberta.
router.param('empresaId', contextoDfc('plano-contas'));
router.get('/:empresaId', controller.list);
// Versões do plano por centro de custo — antes de '/:empresaId/:siengeId' (senão "versoes" seria conta).
router.get('/:empresaId/todas', controller.listTodas);
router.get('/:empresaId/resumo', controller.resumo);
router.get('/:empresaId/excel', controller.exportarExcel);
router.get('/:empresaId/versoes', controller.listVersoes);
router.post('/:empresaId/versoes', controller.criarVersao);
router.delete('/:empresaId/versoes/:centroId', controller.excluirVersao);
router.put('/:empresaId/:siengeId', controller.update);

module.exports = router;
