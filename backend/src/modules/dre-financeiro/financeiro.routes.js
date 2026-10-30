const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./financeiro.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId/exercicios', controller.exercicios);
router.get('/:empresaId/exercicios/:ano/lancamentos', controller.lancamentos);
router.get('/:empresaId/exercicios/:ano/filtros', controller.filtros);

module.exports = router;
