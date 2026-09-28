const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./relatorioMasa.controller');

const router = Router();

router.use(authMiddleware);
router.get('/fases', controller.getFases);
router.get('/empreendimentos', controller.getEmpreendimentos);

module.exports = router;
