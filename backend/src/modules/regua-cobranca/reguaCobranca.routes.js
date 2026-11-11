const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramRecurso } = require('../../middlewares/acesso.middleware');
const { exigirAdministradorCobranca } = require('../cobranca-acesso/cobrancaAcesso.service');
const controller = require('./reguaCobranca.controller');

const router = Router();

// Abas Régua de Cobrança e Configurações: só o Usuário Administrador da
// Gestão de Cobranças desta empresa (ou Master — ver cobranca-acesso). Ficam
// livres pra quem tem a tela só as leituras que as abas Rotinas/Gestão das
// Parcelas também usam: responsaveis, data-sistema, GET comunicacao-automatica
// e GET distribuicao/config.
const soAdministrador = exigirAdministradorCobranca('SELECT empresa_id FROM regua_cobranca_etapas WHERE id = $1');

router.use(authMiddleware);
router.param('id', paramRecurso('SELECT empresa_id FROM regua_cobranca_etapas WHERE id = $1'));
router.get('/resumo', soAdministrador, controller.getResumo);
router.get('/responsaveis', controller.listResponsaveis);
router.get('/etapas', soAdministrador, controller.listEtapas);
router.post('/etapas', soAdministrador, controller.criarEtapa);
router.put('/etapas/:id', soAdministrador, controller.atualizarEtapa);
router.delete('/etapas/:id', soAdministrador, controller.removerEtapa);
router.get('/parametros-disparo', soAdministrador, controller.listParametrosDisparo);
router.put('/parametros-disparo', soAdministrador, controller.salvarParametroDisparo);
router.get('/data-sistema', controller.getDataSistema);
router.get('/comunicacao-automatica', controller.getComunicacaoAutomatica);
router.put('/comunicacao-automatica', soAdministrador, controller.salvarComunicacaoAutomatica);
router.get('/tipos-pagamento', soAdministrador, controller.getTiposPagamento);
router.put('/tipos-pagamento', soAdministrador, controller.salvarTiposPagamento);
router.get('/distribuicao', soAdministrador, controller.getDistribuicao);
router.get('/distribuicao/config', controller.getConfigDistribuicao);
router.put('/distribuicao/config', soAdministrador, controller.salvarConfigDistribuicao);
router.post('/distribuicao/participantes', soAdministrador, controller.adicionarParticipante);
router.delete('/distribuicao/participantes/:usuarioId', soAdministrador, controller.removerParticipante);
router.put('/distribuicao/participantes/:usuarioId/pausa', soAdministrador, controller.pausarParticipante);
router.post('/distribuicao/participantes/:usuarioId/substituir', soAdministrador, controller.substituirParticipante);
router.post('/distribuicao/distribuir', soAdministrador, controller.distribuirHoje);

module.exports = router;
