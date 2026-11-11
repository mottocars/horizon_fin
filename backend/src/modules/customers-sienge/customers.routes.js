const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./customers.controller');
const { exigirAdministradorCobranca } = require('../cobranca-acesso/cobrancaAcesso.service');

const router = Router();

router.use(authMiddleware);
router.get('/resumo', controller.getResumo);
router.get('/resumo-centro-custo', controller.getResumoPorCentroCusto);
router.get('/clientes-por-centro-custo', controller.listClientesPorCentroCusto);
router.get('/exportar', controller.exportExcel);
router.post('/sincronizar', controller.sincronizar);
// Flag "Comunicar" (aba Clientes): só o Usuário Administrador da Gestão de Cobranças (ou Master).
router.put('/comunicar', exigirAdministradorCobranca(), controller.setComunicar);
router.put('/comunicar-centro-custo', exigirAdministradorCobranca(), controller.setComunicarCentroCusto);

module.exports = router;
