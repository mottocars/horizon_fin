const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDfc } = require('../dfc-versoes/contexto');
const controller = require('./desembolso.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versões da DFC (dfc-versoes/contexto.js): lê a versão aberta, a escolhida no Visualizar (X-Dfc-Versao) ou a
// publicada; gravar só com a versão aberta.
router.param('empresaId', contextoDfc('plano-contas', { livre: (req) => /\/recalcular$/.test(req.path) }));
router.get('/:empresaId', controller.listar);
router.get('/:empresaId/:siengeId', controller.obter);
router.post('/:empresaId/:siengeId/recalcular', controller.recalcular);

module.exports = router;
