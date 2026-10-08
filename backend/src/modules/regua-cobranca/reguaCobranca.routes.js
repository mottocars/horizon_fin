const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramRecurso } = require('../../middlewares/acesso.middleware');
const controller = require('./reguaCobranca.controller');

const router = Router();

router.use(authMiddleware);
router.param('id', paramRecurso('SELECT empresa_id FROM regua_cobranca_etapas WHERE id = $1'));
router.get('/resumo', controller.getResumo);
router.get('/responsaveis', controller.listResponsaveis);
router.get('/etapas', controller.listEtapas);
router.post('/etapas', controller.criarEtapa);
router.put('/etapas/:id', controller.atualizarEtapa);
router.delete('/etapas/:id', controller.removerEtapa);
router.get('/parametros-disparo', controller.listParametrosDisparo);
router.put('/parametros-disparo', controller.salvarParametroDisparo);
router.get('/data-sistema', controller.getDataSistema);
router.get('/comunicacao-automatica', controller.getComunicacaoAutomatica);
router.put('/comunicacao-automatica', controller.salvarComunicacaoAutomatica);
router.get('/distribuicao', controller.getDistribuicao);
router.get('/distribuicao/config', controller.getConfigDistribuicao);
router.put('/distribuicao/config', controller.salvarConfigDistribuicao);
router.post('/distribuicao/participantes', controller.adicionarParticipante);
router.delete('/distribuicao/participantes/:usuarioId', controller.removerParticipante);
router.put('/distribuicao/participantes/:usuarioId/pausa', controller.pausarParticipante);
router.post('/distribuicao/participantes/:usuarioId/substituir', controller.substituirParticipante);
router.post('/distribuicao/distribuir', controller.distribuirHoje);

module.exports = router;
