const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./monitor.controller');

const router = Router();

router.use(authMiddleware);
router.get('/:empresaId', controller.getPainel);
router.put('/:empresaId/:rotina/agendamento', controller.salvarAgendamento);
router.post('/:empresaId/:rotina/executar', controller.executar);

module.exports = router;
