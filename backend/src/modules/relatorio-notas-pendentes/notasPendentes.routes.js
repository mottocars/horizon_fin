const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./notasPendentes.controller');

const router = Router();

router.use(authMiddleware);
router.get('/', controller.listar);

module.exports = router;
