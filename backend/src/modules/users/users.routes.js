const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./users.controller');

const router = Router();

router.get('/me', authMiddleware, controller.me);
router.put('/me', authMiddleware, controller.updateMe);
router.put('/me/primeiro-acesso', authMiddleware, controller.primeiroAcesso);

module.exports = router;
