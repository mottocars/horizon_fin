const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { exigirAdministradorDaTela } = require('../../middlewares/acesso.middleware');
const T = require('../../config/telas');
const controller = require('./motorRisco.controller');

const router = Router();

router.use(authMiddleware);
// Aba Motor de Risco da Gestão de Cobranças: só o Administrador da tela (ou
// Master). Os scores mostrados nas outras abas vêm de /cobranca-clusters.
router.use(exigirAdministradorDaTela(T.COBRANCAS));
router.get('/versoes', controller.listVersoes);
router.get('/versoes/:versao', controller.getVersao);
router.post('/versoes', controller.criarVersao);

module.exports = router;
