const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramRecurso, exigirAdministradorDaTela } = require('../../middlewares/acesso.middleware');
const T = require('../../config/telas');
const controller = require('./comunicacao.controller');

const router = Router();

router.use(authMiddleware);
// Aba Comunicação da Gestão de Cobranças (templates): só o Administrador da
// tela (ou Master). A Rotina recebe o texto pronto de /rotinas.
router.use(exigirAdministradorDaTela(T.COBRANCAS));
router.param('id', paramRecurso('SELECT empresa_id FROM comunicacao_templates WHERE id = $1'));
router.get('/templates', controller.listTemplates);
router.post('/templates', controller.criarTemplate);
router.put('/templates/:id', controller.atualizarTemplate);
router.delete('/templates/:id', controller.removerTemplate);

module.exports = router;
