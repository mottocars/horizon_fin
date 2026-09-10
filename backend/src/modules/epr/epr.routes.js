const { Router } = require('express');
const multer = require('multer');
const os = require('os');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./epr.controller');

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      const err = new Error('Apenas arquivos PDF são aceitos.');
      err.status = 400;
      err.expose = true;
      return cb(err);
    }
    cb(null, true);
  },
});

const router = Router();

router.use(authMiddleware);
router.get('/:empresaId', controller.listEmpreendimentos);
router.post('/:empresaId/importar', upload.single('arquivo'), controller.importar);
router.get('/:empresaId/exportar', controller.exportExcelTodos);
router.get('/:empresaId/:contratoMestreObra/download', controller.download);
router.get('/:empresaId/:contratoMestreObra/exportar', controller.exportExcel);
router.delete('/:empresaId/:contratoMestreObra', controller.excluir);

module.exports = router;
