const { Router } = require('express');
const multer = require('multer');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDfc } = require('../dfc-versoes/contexto');
const controller = require('./planilhaOrcamentaria.controller');

// Planilha Orçamentária do DFC Construtoras (aba Orçamentos): layout para baixar e importação (Nova versão).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/\.xlsx$/i.test(file.originalname || '')) {
      const err = new Error('Envie o arquivo .xlsx da Planilha Orçamentária.');
      err.status = 400;
      err.expose = true;
      return cb(err);
    }
    cb(null, true);
  },
});

const router = Router();
router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versões da DFC (dfc-versoes/contexto.js): lê a versão aberta, a escolhida no Visualizar (X-Dfc-Versao) ou a
// publicada; gravar só com a versão aberta.
router.param('empresaId', contextoDfc('orcamentos', { livre: (req) => !['1', 'true'].includes(String(req.query.aplicar)) }));
router.get('/:empresaId/layout', controller.layout);
router.get('/:empresaId/situacao', controller.situacao);
router.post('/:empresaId/importar', upload.single('arquivo'), controller.importar);

module.exports = router;
