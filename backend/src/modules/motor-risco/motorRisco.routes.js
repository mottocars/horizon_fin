const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./motorRisco.controller');

const router = Router();

router.use(authMiddleware);
router.get('/versoes', controller.listVersoes);
router.get('/versoes/:versao', controller.getVersao);
router.post('/versoes', controller.criarVersao);

module.exports = router;
