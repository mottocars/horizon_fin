const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramRecurso } = require('../../middlewares/acesso.middleware');
const controller = require('./mascaras.controller');

const router = Router();

router.use(authMiddleware);
router.param('id', paramRecurso('SELECT empresa_id FROM mascara_itens WHERE id = $1'));
router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
