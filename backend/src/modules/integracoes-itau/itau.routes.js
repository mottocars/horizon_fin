const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./itau.controller');

const router = Router();

router.use(authMiddleware);
router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id/status', controller.setStatus);
router.post('/:id/certificado', controller.gerarCertificado);
router.post('/:id/certificado/renovar', controller.renovarCertificado);
router.post('/:id/testar', controller.testar);

module.exports = router;
