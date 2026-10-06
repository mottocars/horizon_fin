const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa, exigirMaster } = require('../../middlewares/acesso.middleware');
const controller = require('./empresas.controller');

const router = Router();

router.use(authMiddleware);
// :id aqui é a própria empresa — mesma checagem do :empresaId dos outros módulos.
router.param('id', paramEmpresa);
router.get('/consulta-cnpj/:cnpj', controller.consultarCnpj);
router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', exigirMaster, controller.create); // nova empresa: só Master (igual à tela)
router.put('/:id', controller.update);
router.patch('/:id/status', controller.setStatus);
router.put('/:id/logo', controller.salvarLogo);
router.delete('/:id/logo', controller.removerLogo);
router.delete('/:id', controller.remove);

module.exports = router;
