const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./cronogramaCentros.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', controller.list);
router.put('/:empresaId/:siengeId/natureza', controller.updateNatureza);
router.put('/:empresaId/:siengeId/datas', controller.updateDatas);

module.exports = router;
