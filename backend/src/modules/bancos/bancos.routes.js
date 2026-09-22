const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./bancos.controller');

const router = Router();

router.use(authMiddleware);
router.get('/', controller.listar);
router.put('/:codigo/logo', controller.salvarLogo);
router.delete('/:codigo/logo', controller.removerLogo);

module.exports = router;
