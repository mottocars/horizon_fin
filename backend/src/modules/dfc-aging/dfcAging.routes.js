const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDfc } = require('../dfc-versoes/contexto');
const controller = require('./dfcAging.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versões da DFC (dfc-versoes/contexto.js): lê a versão aberta, a escolhida no Visualizar (X-Dfc-Versao) ou a
// publicada; gravar só com a versão aberta.
router.param('empresaId', contextoDfc('orcamentos', { livre: (req) => /\/atualizar$/.test(req.path) }));
// :tipo = receber | pagar
router.get('/:empresaId/:tipo', controller.aging);
router.get('/:empresaId/:tipo/execucao', controller.execucao);
router.post('/:empresaId/:tipo/atualizar', controller.atualizarBase);

module.exports = router;
