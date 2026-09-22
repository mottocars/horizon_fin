const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./vanpix.controller');

const router = Router();

router.use(authMiddleware);
router.get('/', controller.list);
router.post('/testar', controller.testar);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id/status', controller.setStatus);
router.post('/:id/testar', controller.testarSalva);

module.exports = router;
