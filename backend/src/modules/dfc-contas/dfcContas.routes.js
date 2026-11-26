const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDfc } = require('../dfc-versoes/contexto');
const controller = require('./dfcContas.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versões da DFC (dfc-versoes/contexto.js): lê a versão aberta, a escolhida no Visualizar (X-Dfc-Versao) ou a
// publicada; gravar só com a versão aberta.
router.param('empresaId', contextoDfc('contas-correntes', { livre: (req) => /\/sincronizar$/.test(req.path) }));
router.get('/:empresaId', controller.list);
router.get('/:empresaId/config-saldo', controller.getConfigSaldo);
router.put('/:empresaId/config-saldo', controller.salvarConfigSaldo);
router.post('/:empresaId/sincronizar', controller.sincronizar);
router.put('/:empresaId/:companyId/:numeroConta', controller.update);

module.exports = router;
