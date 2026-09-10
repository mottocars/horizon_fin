const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./rotinas.controller');

const router = Router();

router.use(authMiddleware);
router.get('/', controller.listRotinas);
router.delete('/canal', controller.desmarcarCanal);

module.exports = router;
