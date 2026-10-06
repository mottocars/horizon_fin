const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramRecurso } = require('../../middlewares/acesso.middleware');
const controller = require('./comunicacao.controller');

const router = Router();

router.use(authMiddleware);
router.param('id', paramRecurso('SELECT empresa_id FROM comunicacao_templates WHERE id = $1'));
router.get('/templates', controller.listTemplates);
router.post('/templates', controller.criarTemplate);
router.put('/templates/:id', controller.atualizarTemplate);
router.delete('/templates/:id', controller.removerTemplate);

module.exports = router;
