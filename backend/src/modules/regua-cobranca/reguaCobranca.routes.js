const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./reguaCobranca.controller');

const router = Router();

router.use(authMiddleware);
router.get('/resumo', controller.getResumo);
router.get('/responsaveis', controller.listResponsaveis);
router.get('/etapas', controller.listEtapas);
router.post('/etapas', controller.criarEtapa);
router.put('/etapas/:id', controller.atualizarEtapa);
router.delete('/etapas/:id', controller.removerEtapa);
router.get('/parametros-disparo', controller.listParametrosDisparo);
router.put('/parametros-disparo', controller.salvarParametroDisparo);
router.get('/data-sistema', controller.getDataSistema);
router.put('/data-sistema', controller.salvarDataSistema);
router.get('/comunicacao-automatica', controller.getComunicacaoAutomatica);
router.put('/comunicacao-automatica', controller.salvarComunicacaoAutomatica);

module.exports = router;
