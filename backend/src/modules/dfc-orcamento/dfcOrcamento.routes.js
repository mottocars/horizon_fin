const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDfc } = require('../dfc-versoes/contexto');
const controller = require('./dfcOrcamento.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versões da DFC (dfc-versoes/contexto.js): lê a versão aberta, a escolhida no Visualizar (X-Dfc-Versao) ou a
// publicada; gravar só com a versão aberta.
router.param('empresaId', contextoDfc('orcamentos'));
router.get('/:empresaId', controller.orcamento);
router.get('/:empresaId/rascunho', controller.rascunho);
router.post('/:empresaId/versoes', controller.salvarVersao);
router.get('/:empresaId/log', controller.log);

module.exports = router;
