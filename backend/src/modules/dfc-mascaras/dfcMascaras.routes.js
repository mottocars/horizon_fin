const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDfc } = require('../dfc-versoes/contexto');
const controller = require('./dfcMascaras.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versões da DFC (dfc-versoes/contexto.js): lê a versão aberta, a escolhida no Visualizar (X-Dfc-Versao) ou a
// publicada; gravar só com a versão aberta.
router.param('empresaId', contextoDfc('mascaras'));
router.get('/:empresaId', controller.list);
router.get('/:empresaId/tipos-parcela', controller.tiposParcela);
router.post('/:empresaId', controller.create);
// Antes de '/:empresaId/:id' — senão "ordem" seria lido como id.
router.put('/:empresaId/ordem', controller.reordenar);
router.put('/:empresaId/:id', controller.update);
router.delete('/:empresaId/:id', controller.remove);

module.exports = router;
