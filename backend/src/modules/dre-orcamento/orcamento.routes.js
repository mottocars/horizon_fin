const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./orcamento.controller');

const router = Router();

router.use(authMiddleware);
// /vigentes precisa vir ANTES de /:siengeId — senão a rota curinga "engole" a palavra
// "vigentes" como se fosse um siengeId (Express casa por posição, não por tipo).
router.get('/:empresaId/vigentes', controller.vigentes);
router.get('/:empresaId/:siengeId', controller.list);
router.put('/:empresaId/:siengeId', controller.salvar);
router.delete('/:empresaId/:siengeId/:dataInicio', controller.remover);

module.exports = router;
