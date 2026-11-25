const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDfc } = require('../dfc-versoes/contexto');
const controller = require('./dfcSaldos.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versões da DFC (dfc-versoes/contexto.js): lê a versão aberta, a escolhida no Visualizar (X-Dfc-Versao) ou a
// publicada; gravar só com a versão aberta.
router.param('empresaId', contextoDfc('dfc', { livre: (req) => /\/atualizar$/.test(req.path) }));
router.get('/:empresaId', controller.saldos);
router.get('/:empresaId/base', controller.base);
router.get('/:empresaId/realizado', controller.realizado);
router.get('/:empresaId/execucao', controller.execucao);
router.post('/:empresaId/atualizar', controller.atualizarBase);

module.exports = router;
