const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDfc } = require('../dfc-versoes/contexto');
const controller = require('./dfcAvancos.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versões da DFC (dfc-versoes/contexto.js): lê a versão aberta, a escolhida no Visualizar (X-Dfc-Versao) ou a
// publicada; gravar só com a versão aberta.
router.param('empresaId', contextoDfc('avancos-obras'));
router.get('/:empresaId', controller.list);
router.get('/:empresaId/curvas', controller.curvas);
router.get('/:empresaId/curvas/excel', controller.excel);
router.put('/:empresaId/:siengeId/manual', controller.salvarManual);

module.exports = router;
