const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramRecurso } = require('../../middlewares/acesso.middleware');
const { exigirAdministradorCobranca } = require('../cobranca-acesso/cobrancaAcesso.service');
const controller = require('./comunicacao.controller');

const router = Router();

router.use(authMiddleware);
// Aba Comunicação da Gestão de Cobranças (templates): só o Usuário
// Administrador da Gestão de Cobranças desta empresa (ou Master — ver
// cobranca-acesso). A Rotina recebe o texto pronto de /rotinas.
const soAdministrador = exigirAdministradorCobranca('SELECT empresa_id FROM comunicacao_templates WHERE id = $1');
router.param('id', paramRecurso('SELECT empresa_id FROM comunicacao_templates WHERE id = $1'));
router.get('/templates', soAdministrador, controller.listTemplates);
router.post('/templates', soAdministrador, controller.criarTemplate);
router.put('/templates/:id', soAdministrador, controller.atualizarTemplate);
router.delete('/templates/:id', soAdministrador, controller.removerTemplate);

module.exports = router;
