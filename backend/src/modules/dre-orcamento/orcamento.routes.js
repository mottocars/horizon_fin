const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const { contextoDre } = require('../dre-versoes/contexto');
const controller = require('./orcamento.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// Versão da DRE do pedido (aberta / última salva / a visualizada) e a trava de gravação (dre-versoes/contexto.js).
router.param('empresaId', contextoDre('orcamento'));
// /vigentes precisa vir ANTES de /:siengeId — senão a rota curinga "engole" a palavra
// "vigentes" como se fosse um siengeId (Express casa por posição, não por tipo).
router.get('/:empresaId/vigentes', controller.vigentes);
router.get('/:empresaId/:siengeId', controller.list);
router.put('/:empresaId/:siengeId', controller.salvar);
router.delete('/:empresaId/:siengeId/:dataInicio', controller.remover);

module.exports = router;
