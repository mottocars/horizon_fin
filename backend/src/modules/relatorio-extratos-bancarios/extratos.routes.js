const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./extratos.controller');

const router = Router();

router.use(authMiddleware);
router.get('/', controller.gerar);

module.exports = router;
