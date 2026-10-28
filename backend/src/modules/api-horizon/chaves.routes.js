const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { exigirMaster } = require('../../middlewares/acesso.middleware');
const controller = require('./chaves.controller');

// Tela Integrações > API Horizon. Cada usuário cuida da própria chave (/minha); o Master também
// vê e revoga as chaves dos outros (/chaves). A empresa do corpo (empresaId) é conferida pelo
// authMiddleware.
const router = Router();

router.use(authMiddleware);
router.get('/minha', controller.minha);
router.post('/minha', controller.gerar);
router.put('/minha/acessos', controller.alterarAcessos);
router.post('/minha/revogar', controller.revogarMinha);
router.get('/minha/requisicoes', controller.minhasRequisicoes);
router.get('/chaves', exigirMaster, controller.listarTodas);
router.post('/chaves/:id/revogar', exigirMaster, controller.revogarDeUsuario);
router.get('/chaves/:id/requisicoes', exigirMaster, controller.requisicoesDaChave);

module.exports = router;
