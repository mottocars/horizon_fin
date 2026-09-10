const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./mascaras.controller');

const router = Router();

router.use(authMiddleware);
router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
