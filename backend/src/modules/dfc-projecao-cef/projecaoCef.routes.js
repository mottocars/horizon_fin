const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDfc } = require('../dfc-versoes/contexto');
const controller = require('./projecaoCef.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versões da DFC (dfc-versoes/contexto.js): lê a versão aberta, a escolhida no Visualizar (X-Dfc-Versao) ou a
// publicada; gravar só com a versão aberta.
router.param('empresaId', contextoDfc('orcamentos', { livre: (req) => /\/atualizar$/.test(req.path) }));
router.get('/:empresaId/elegiveis', controller.elegiveis);
router.get('/:empresaId/orcamento', controller.orcamento);
router.post('/:empresaId/:siengeId/atualizar', controller.atualizar);

module.exports = router;
