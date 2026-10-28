const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./chaves.controller');

// Tela Integrações > API Horizon. A empresa do corpo (empresaId) é conferida pelo
// authMiddleware; dono da chave e Master são conferidos no service.
const router = Router();

router.use(authMiddleware);
router.get('/chaves', controller.listar);
router.post('/chaves', controller.criar);
router.post('/chaves/:id/revogar', controller.revogar);
router.get('/chaves/:id/requisicoes', controller.requisicoes);

module.exports = router;
