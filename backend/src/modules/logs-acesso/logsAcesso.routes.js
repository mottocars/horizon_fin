const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./logsAcesso.controller');

const router = Router();

router.use(authMiddleware);
router.get('/metricas', controller.metricas);
// Fica embaixo de /metricas de propósito: o exigirTela(METRICAS) do server.js vale pra ela também.
router.get('/metricas/usuarios/:usuarioId/locais', controller.locaisUsuario);
router.post('/', controller.registrar);

module.exports = router;
