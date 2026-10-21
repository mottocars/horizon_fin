const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa, exigirAdministradorDaTela } = require('../../middlewares/acesso.middleware');
const T = require('../../config/telas');
const controller = require('./cronogramaConfig.controller');

const router = Router();

// Aba Configurações de Cronogramas Obras: só o Administrador da tela (ou Master) — mesmo esquema da
// aba Configurações de Repasses CEF.
const soAdministrador = exigirAdministradorDaTela(T.CRONOGRAMAS_OBRAS);

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', soAdministrador, controller.getConfig);
router.put('/:empresaId', soAdministrador, controller.salvarConfig);

module.exports = router;
