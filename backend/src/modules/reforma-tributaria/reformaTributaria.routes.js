const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./reformaTributaria.controller');

// Operações > Reforma Tributária (ver reformaTributaria.service.js).
const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId/impacto', controller.impacto);
router.get('/:empresaId/impacto-dfc', controller.impactoDfc);
router.get('/:empresaId/configuracoes-dfc', controller.obterConfigDfc);
router.put('/:empresaId/configuracoes-dfc', controller.salvarConfigDfc);
router.delete('/:empresaId/configuracoes-dfc', controller.restaurarConfigDfc);
router.get('/:empresaId/centros', controller.listarCentros);
router.put('/:empresaId/centros/:centroId', controller.salvarCentro);
router.delete('/:empresaId/centros/:centroId', controller.limparCentro);
router.get('/:empresaId/configuracoes', controller.obterConfiguracoes);
router.put('/:empresaId/configuracoes', controller.salvarConfiguracoes);
router.delete('/:empresaId/configuracoes', controller.restaurarConfiguracoes);

module.exports = router;
