const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./cep.controller');

const router = Router();

router.use(authMiddleware);
router.get('/:cep', controller.consultarCep);

module.exports = router;
