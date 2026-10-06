const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa, paramRecurso, exigirRecursosDoCorpo } = require('../../middlewares/acesso.middleware');
const controller = require('./espiao.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.param('notaId', paramRecurso('SELECT empresa_id FROM espiao_notas WHERE id = $1', 'Nota não encontrada.'));
router.param('certificadoId', paramRecurso('SELECT empresa_id FROM certificados_digitais WHERE id = $1', 'Certificado não encontrado.'));
const notasDoCorpo = exigirRecursosDoCorpo('notaIds', 'SELECT empresa_id FROM espiao_notas WHERE id = ANY($1::int[])');
router.get('/empresas', controller.listEmpresas);
router.post('/:empresaId/consultar', controller.consultar);
router.get('/:empresaId/notas', controller.listNotas);
router.get('/:empresaId/notas-resumo', controller.contarNotasPorAba);
router.get('/:empresaId/certificados', controller.listCertificados);
router.get('/:empresaId/agendamento', controller.getAgendamento);
router.put('/:empresaId/agendamento', controller.salvarAgendamento);
router.get('/:empresaId/configuracoes', controller.getConfiguracoes);
router.put('/:empresaId/configuracoes', controller.salvarConfiguracoes);
router.post('/certificados/:certificadoId/consultar', controller.consultarCertificado);
router.get('/certificados/:certificadoId/notas', controller.listNotasPorCertificado);
router.get('/notas/:notaId/eventos', controller.listEventosPorNota);
router.get('/notas/:notaId/download', controller.download);
router.get('/notas/:notaId/download-pdf', controller.downloadPdf);
router.get('/notas/:notaId/titulos-sienge', controller.listTitulosSienge);
router.post('/notas/:notaId/vinculo', controller.vincular);
router.delete('/notas/:notaId/vinculo', controller.desvincular);
router.get('/:empresaId/notas-inativadas', controller.listNotasInativadas);
router.get('/certificados/:certificadoId/notas-inativadas', controller.listNotasInativadasPorCertificado);
router.post('/notas/inativar', notasDoCorpo, controller.inativar);
router.post('/notas/reativar', notasDoCorpo, controller.reativar);
router.post('/notas/declarar-ciencia', notasDoCorpo, controller.declararCiencia);
router.post('/notas/desmarcar-ciencia', notasDoCorpo, controller.desmarcarCiencia);

module.exports = router;
