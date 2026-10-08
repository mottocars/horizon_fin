const { Router } = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const pool = require('../../config/db');
const { paramRecurso, exigirAdministradorDaTela } = require('../../middlewares/acesso.middleware');
const T = require('../../config/telas');
const controller = require('./mascaras.controller');

const router = Router();

// Máscaras de Repasses CEF (tipo REPASSES): ler continua livre (o Kanban e o
// histórico de etapas usam), mas criar/editar/excluir é da aba Máscaras de
// Repasses CEF — só o Administrador daquela tela (ou Master). PUT/DELETE não
// mandam o tipo, então ele vem do próprio registro.
const soAdministradorRepasses = exigirAdministradorDaTela(T.REPASSES);
async function repassesSoAdministrador(req, res, next) {
  try {
    let tipo = req.body?.tipo;
    if (req.params.id) {
      const { rows } = await pool.query('SELECT tipo FROM mascara_itens WHERE id = $1', [req.params.id]);
      tipo = rows[0]?.tipo;
    }
    if (tipo !== 'REPASSES') return next();
    return soAdministradorRepasses(req, res, next);
  } catch (err) {
    if (err.code === '22P02') return next();
    next(err);
  }
}

router.use(authMiddleware);
router.param('id', paramRecurso('SELECT empresa_id FROM mascara_itens WHERE id = $1'));
router.get('/', controller.list);
router.post('/', repassesSoAdministrador, controller.create);
router.put('/:id', repassesSoAdministrador, controller.update);
router.delete('/:id', repassesSoAdministrador, controller.remove);

module.exports = router;
