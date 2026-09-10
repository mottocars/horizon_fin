const { Router } = require('express');
const multer = require('multer');
const os = require('os');
const path = require('path');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./extrato.controller');

const EXTENSOES_ACEITAS = ['.xls', '.xlsx'];

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const extensao = path.extname(file.originalname).toLowerCase();
    if (!EXTENSOES_ACEITAS.includes(extensao)) {
      const err = new Error('Apenas arquivos .xls ou .xlsx são aceitos.');
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
router.get('/:empresaId/:contratoEmpreendimento/download', controller.download);
router.get('/:empresaId/:contratoEmpreendimento/exportar', controller.exportExcel);
router.delete('/:empresaId/:contratoEmpreendimento', controller.excluir);

module.exports = router;
