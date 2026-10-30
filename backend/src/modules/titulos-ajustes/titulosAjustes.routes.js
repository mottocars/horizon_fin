const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./titulosAjustes.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// :origem = R (contas a receber) ou P (contas a pagar); :billId = número do título no Sienge.
router.get('/:empresaId/:origem/:billId', controller.obter);
router.put('/:empresaId/:origem/:billId', controller.salvar);
router.delete('/:empresaId/:origem/:billId', controller.restaurar);

module.exports = router;
