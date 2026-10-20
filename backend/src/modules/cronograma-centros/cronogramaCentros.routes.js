const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./cronogramaCentros.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Só a lista: a aba Centros de Custos de Cronogramas Obras não edita direto (abre o cadastro do
// centro numa janela). updateDatas é montado em centros.routes.js (aba Histórico de Etapas).
router.get('/:empresaId', controller.list);

module.exports = router;
