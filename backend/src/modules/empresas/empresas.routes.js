const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./empresas.controller');

const router = Router();

router.use(authMiddleware);
router.get('/consulta-cnpj/:cnpj', controller.consultarCnpj);
router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id/status', controller.setStatus);
router.delete('/:id', controller.remove);

module.exports = router;
