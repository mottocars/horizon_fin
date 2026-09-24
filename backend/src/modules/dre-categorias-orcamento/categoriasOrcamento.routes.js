const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./categoriasOrcamento.controller');

const router = Router();

router.use(authMiddleware);
router.get('/:empresaId', controller.list);
router.post('/:empresaId', controller.create);
router.delete('/:empresaId/:id', controller.remove);

module.exports = router;
