const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./dreMascaras.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', controller.list);
router.post('/:empresaId', controller.create);
// Antes de '/:empresaId/:id' — senão "ordem" seria lido como id.
router.put('/:empresaId/ordem', controller.reordenar);
router.put('/:empresaId/:id', controller.update);
router.delete('/:empresaId/:id', controller.remove);

module.exports = router;
