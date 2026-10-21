const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./cronogramaCentros.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// A lista: a aba Centros de Custos de Cronogramas Obras não edita direto (abre o cadastro do
// centro numa janela). updateDatas é montado em centros.routes.js (aba Histórico de Etapas) e só
// guarda a alteração como pendente.
router.get('/:empresaId', controller.list);
// Versionamento (cronogramaVersoes.service.js): as alterações pendentes (com a prévia do
// comunicado), descartar a de uma obra, as versões gravadas, gravar uma nova (aplica as pendências
// e manda o WhatsApp) e a planilha de uma versão.
router.get('/:empresaId/pendencias', controller.listPendencias);
router.delete('/:empresaId/pendencias/:siengeId', controller.descartarPendencia);
router.get('/:empresaId/versoes', controller.listVersoes);
router.post('/:empresaId/versoes', controller.gravarVersao);
router.get('/:empresaId/versoes/:versaoId/excel', controller.excelVersao);

module.exports = router;
