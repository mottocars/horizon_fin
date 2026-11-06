const { Router } = require('express');
const multer = require('multer');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./dreProjecoes.controller');

// Planilha da Projeção (importação): só .xlsx, em memória — mesmo esquema da Planilha Orçamentária da DFC.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/\.xlsx$/i.test(file.originalname || '')) {
      const err = new Error('Envie o arquivo .xlsx da Projeção da DRE.');
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
router.get('/:empresaId', controller.listar);
router.get('/:empresaId/layout', controller.layout);
router.get('/:empresaId/projetado', controller.projetado);
router.post('/:empresaId/importar', upload.single('arquivo'), controller.importar);
router.post('/:empresaId/versoes', controller.salvarVersao);
router.post('/:empresaId/orcamentos', controller.criar);
router.get('/:empresaId/orcamentos/:id', controller.obter);
router.put('/:empresaId/orcamentos/:id', controller.atualizar);
router.delete('/:empresaId/orcamentos/:id', controller.descartar);
router.get('/:empresaId/orcamentos/:id/historico', controller.historico);
router.get('/:empresaId/orcamentos/:id/unidades', controller.unidades);
router.get('/:empresaId/orcamentos/:id/contas', controller.contas);
router.get('/:empresaId/orcamentos/:id/calculo', controller.calcular);
router.post('/:empresaId/orcamentos/:id/concluir', controller.concluir);

module.exports = router;
