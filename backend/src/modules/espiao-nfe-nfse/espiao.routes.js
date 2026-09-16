const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./espiao.controller');

const router = Router();

router.use(authMiddleware);
router.get('/empresas', controller.listEmpresas);
router.post('/:empresaId/consultar', controller.consultar);
router.get('/:empresaId/notas', controller.listNotas);
router.get('/:empresaId/certificados', controller.listCertificados);
router.get('/:empresaId/agendamento', controller.getAgendamento);
router.put('/:empresaId/agendamento', controller.salvarAgendamento);
router.post('/certificados/:certificadoId/consultar', controller.consultarCertificado);
router.get('/certificados/:certificadoId/notas', controller.listNotasPorCertificado);
router.get('/notas/:notaId/download', controller.download);
router.get('/notas/:notaId/download-pdf', controller.downloadPdf);
router.get('/:empresaId/notas-inativadas', controller.listNotasInativadas);
router.get('/certificados/:certificadoId/notas-inativadas', controller.listNotasInativadasPorCertificado);
router.post('/notas/inativar', controller.inativar);
router.post('/notas/reativar', controller.reativar);
router.post('/notas/declarar-ciencia', controller.declararCiencia);
router.post('/notas/desmarcar-ciencia', controller.desmarcarCiencia);

module.exports = router;
