const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./orcamento.controller');

const router = Router();

router.use(authMiddleware);
router.get('/:empresaId/:siengeId', controller.list);
router.put('/:empresaId/:siengeId', controller.salvar);
router.delete('/:empresaId/:siengeId/:dataInicio', controller.remover);

module.exports = router;
