const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDfc } = require('../dfc-versoes/contexto');
const controller = require('./dividaPj.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versões da DFC (dfc-versoes/contexto.js): lê a versão aberta, a escolhida no Visualizar (X-Dfc-Versao) ou a
// publicada; gravar só com a versão aberta.
router.param('empresaId', contextoDfc('divida-pj'));
// /vigentes antes de /:siengeId (senão a rota curinga pega a palavra como centro).
router.get('/:empresaId/vigentes', controller.vigentes);
router.get('/:empresaId/:siengeId', controller.list);
router.put('/:empresaId/:siengeId', controller.salvar);
router.delete('/:empresaId/:siengeId/:mes', controller.remover);

module.exports = router;
