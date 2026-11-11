const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./cobrancaAcesso.controller');
const { exigirAdministradorCobranca } = require('./cobrancaAcesso.service');

// Gestão de Cobranças › Configurações › "Usuário Administrador" (montado com exigirTela da Gestão de
// Cobranças em server.js). meu-acesso é de todos; ver e mudar a lista, só o Administrador.
const router = Router();
router.use(authMiddleware);
router.get('/meu-acesso', controller.meuAcesso);
router.get('/administradores', exigirAdministradorCobranca(), controller.getAdministradores);
router.put('/administradores', exigirAdministradorCobranca(), controller.salvarAdministradores);

module.exports = router;
