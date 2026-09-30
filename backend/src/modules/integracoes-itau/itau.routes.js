const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./itau.controller');

const router = Router();

router.use(authMiddleware);
router.get('/', controller.list);
router.post('/conferir', controller.conferir); // etapa "Buscar dados"
router.post('/', controller.gerar); // etapa "Gerar certificado" (cria a conexão)
router.get('/:id', controller.getById);
router.put('/:id', controller.atualizar);
router.patch('/:id/status', controller.setStatus);
router.post('/:id/certificado', controller.gerarNovamente); // novo token numa conexão com erro/vencida
router.post('/:id/testar-token', controller.testarToken);
router.post('/:id/testar-extrato', controller.testarExtrato);
router.post('/:id/renovar', controller.renovar);

module.exports = router;
