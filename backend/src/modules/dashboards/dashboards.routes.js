const { Router } = require('express');
const { z } = require('zod');
const pool = require('../../config/db');
const authMiddleware = require('../../middlewares/auth.middleware');

// Dashboards: tela favorita (estrela) de cada usuário em cada dashboard — a que abre ao entrar pelo
// menu. Cada usuário só lê e grava a própria. Montado em server.js com exigirTela dos dashboards.
//   GET /:dashboard/favorita            -> { tela | null }
//   PUT /:dashboard/favorita { tela }   -> { tela } (tela null = tira a favorita)

const DASHBOARDS = {
  'economico-financeiro': ['dre', 'fluxo-caixa', 'aging', 'detalhamento', 'saldos'],
};

const router = Router();
router.use(authMiddleware);

function dashboardDe(req, res) {
  const telas = DASHBOARDS[req.params.dashboard];
  if (!telas) res.status(404).json({ message: 'Dashboard não encontrado.' });
  return telas;
}

router.get('/:dashboard/favorita', async (req, res, next) => {
  try {
    if (!dashboardDe(req, res)) return;
    const { rows } = await pool.query('SELECT tela FROM usuarios_dashboard_favoritos WHERE usuario_id = $1 AND dashboard = $2', [
      req.user.id,
      req.params.dashboard,
    ]);
    res.json({ tela: rows[0]?.tela ?? null });
  } catch (err) {
    next(err);
  }
});

router.put('/:dashboard/favorita', async (req, res, next) => {
  try {
    const telas = dashboardDe(req, res);
    if (!telas) return;
    const { tela } = z.object({ tela: z.enum(telas).nullable() }).parse(req.body || {});
    if (tela === null) {
      await pool.query('DELETE FROM usuarios_dashboard_favoritos WHERE usuario_id = $1 AND dashboard = $2', [req.user.id, req.params.dashboard]);
    } else {
      await pool.query(
        `INSERT INTO usuarios_dashboard_favoritos (usuario_id, dashboard, tela, atualizado_em) VALUES ($1, $2, $3, $4)
         ON CONFLICT (usuario_id, dashboard) DO UPDATE SET tela = EXCLUDED.tela, atualizado_em = EXCLUDED.atualizado_em`,
        [req.user.id, req.params.dashboard, tela, new Date()]
      );
    }
    res.json({ tela });
  } catch (err) {
    if (err.issues) return res.status(400).json({ message: 'Tela inválida.' });
    next(err);
  }
});

module.exports = router;
