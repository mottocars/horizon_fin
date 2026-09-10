const { Router } = require('express');
const multer = require('multer');
const os = require('os');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./historicoCliente.controller');

// Mesmo padrão de repassesCef.routes.js: até 2MB por arquivo, qualquer
// extensão (sem fileFilter).
const uploadAnexo = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const router = Router();

router.use(authMiddleware);
router.get('/parcelas/:billId/:installmentId', controller.getHistorico);
router.post('/registros', uploadAnexo.array('arquivos'), controller.registrarObservacao);
router.get('/anexos/:anexoId/download', controller.downloadAnexo);

module.exports = router;
