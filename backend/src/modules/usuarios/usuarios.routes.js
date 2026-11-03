const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./usuarios.controller');

const router = Router();

router.use(authMiddleware);
router.param('id', controller.paramUsuarioAcessivel);
router.get('/', controller.list);
// Antes de '/:id' — senão "acessos" vira um id.
router.get('/acessos', controller.listAcessos);
router.put('/acessos', controller.atualizarAcessos);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id/status', controller.setStatus);

module.exports = router;
