const { Router } = require('express');
const multer = require('multer');
const os = require('os');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./projetos.controller');

// Anexos dos cards: até 10 arquivos de 20 MB por envio, qualquer tipo.
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 20 * 1024 * 1024, files: 10 } });

function tratarLimiteUpload(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const e = new Error(err.code === 'LIMIT_FILE_SIZE' ? 'Cada arquivo pode ter no máximo 20 MB.' : 'Envie no máximo 10 arquivos por vez.');
    e.status = 400;
    e.expose = true;
    return next(e);
  }
  next(err);
}

const router = Router();

router.use(authMiddleware);
router.get('/cards', controller.listar);
router.get('/responsaveis', controller.responsaveis);
router.post('/cards', controller.criar);
router.get('/cards/:id', controller.obter);
router.put('/cards/:id', controller.atualizar);
router.delete('/cards/:id', controller.excluir);
router.patch('/cards/:id/status', controller.mover);
router.post('/cards/:id/finalizar', controller.finalizar);
router.post('/cards/:id/devolver', controller.devolver);
router.post('/cards/:id/comentarios', controller.comentar);
router.delete('/cards/:id/comentarios/:comentarioId', controller.excluirComentario);
router.post('/cards/:id/anexos', upload.array('arquivos', 10), tratarLimiteUpload, controller.anexar);
router.get('/cards/:id/anexos/:anexoId', controller.baixarAnexo);
router.delete('/cards/:id/anexos/:anexoId', controller.excluirAnexo);

module.exports = router;
