const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./income.controller');

const router = Router();

router.use(authMiddleware);
router.get('/resumo', controller.getResumo);
router.post('/sincronizar', controller.sincronizar);

module.exports = router;
