const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./comunicacao.controller');

const router = Router();

router.use(authMiddleware);
router.get('/templates', controller.listTemplates);
router.post('/templates', controller.criarTemplate);
router.put('/templates/:id', controller.atualizarTemplate);
router.delete('/templates/:id', controller.removerTemplate);

module.exports = router;
