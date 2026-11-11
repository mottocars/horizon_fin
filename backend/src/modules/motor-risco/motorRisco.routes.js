const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { exigirAdministradorCobranca } = require('../cobranca-acesso/cobrancaAcesso.service');
const controller = require('./motorRisco.controller');

const router = Router();

router.use(authMiddleware);
// Aba Motor de Risco da Gestão de Cobranças: só o Usuário Administrador da
// Gestão de Cobranças desta empresa (ou Master — ver cobranca-acesso). Os
// scores mostrados nas outras abas vêm de /cobranca-clusters.
router.use(exigirAdministradorCobranca());
router.get('/versoes', controller.listVersoes);
router.get('/versoes/:versao', controller.getVersao);
router.post('/versoes', controller.criarVersao);

module.exports = router;
