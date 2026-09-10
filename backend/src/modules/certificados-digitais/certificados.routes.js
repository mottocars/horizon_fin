const { Router } = require('express');
const multer = require('multer');
const os = require('os');
const path = require('path');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./certificados.controller');

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.pfx') {
      const err = new Error('Apenas arquivos .pfx são aceitos.');
      err.status = 400;
      err.expose = true;
      return cb(err);
    }
    cb(null, true);
  },
});

const router = Router();

router.use(authMiddleware);
router.get('/:empresaId', controller.listPorEmpresa);
router.post('/:empresaId', upload.single('arquivo'), controller.criar);
router.put('/:id/substituir', upload.single('arquivo'), controller.substituir);

module.exports = router;
