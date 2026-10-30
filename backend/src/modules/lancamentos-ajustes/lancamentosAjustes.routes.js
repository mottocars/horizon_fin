const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./lancamentosAjustes.controller');

const router = Router();

router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
// :origem = R (a receber), P (a pagar) ou E (movimento do extrato); :chave = número do título ou id do
// lançamento no extrato do Sienge; ?centro=&natureza= = a linha de rateio original.
router.get('/:empresaId/:origem/:chave', controller.obter);
router.put('/:empresaId/:origem/:chave', controller.salvar);
router.delete('/:empresaId/:origem/:chave', controller.restaurar);

module.exports = router;
