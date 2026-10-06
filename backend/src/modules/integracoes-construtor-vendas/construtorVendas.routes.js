const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramRecurso } = require('../../middlewares/acesso.middleware');
const controller = require('./construtorVendas.controller');

const router = Router();

router.use(authMiddleware);
router.param('id', paramRecurso('SELECT empresa_id FROM integracoes_construtor_vendas WHERE id = $1'));
router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id/status', controller.setStatus);

module.exports = router;
