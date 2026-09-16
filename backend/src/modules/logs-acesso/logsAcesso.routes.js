const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./logsAcesso.controller');

const router = Router();

router.use(authMiddleware);
router.get('/metricas', controller.metricas);
router.post('/', controller.registrar);

module.exports = router;
