const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDfc } = require('../dfc-versoes/contexto');
const controller = require('./dfcEmpresarial.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versões da DFC (dfc-versoes/contexto.js): lê a versão aberta, a escolhida no Visualizar (X-Dfc-Versao) ou a
// publicada; gravar só com a versão aberta.
router.param('empresaId', contextoDfc('orcamentos', { livre: (req) => /\/atualizar$/.test(req.path) }));
router.get('/:empresaId', controller.base);
router.get('/:empresaId/valores', controller.valores);
router.get('/:empresaId/execucao', controller.execucao);
router.post('/:empresaId/atualizar', controller.atualizarBase);

module.exports = router;
