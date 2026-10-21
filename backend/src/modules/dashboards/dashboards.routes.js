const { Router } = require('express');
const { z } = require('zod');
const pool = require('../../config/db');
const authMiddleware = require('../../middlewares/auth.middleware');
const fluxoCaixaPainel = require('./fluxoCaixaPainel.service');

// Dashboards: tela favorita (estrela) de cada usuário em cada dashboard — a que abre ao entrar pelo
// menu. Cada usuário só lê e grava a própria. Montado em server.js com exigirTela dos dashboards.
//   GET /:dashboard/favorita            -> { tela | null }
//   PUT /:dashboard/favorita { tela }   -> { tela } (tela null = tira a favorita)
//   GET /economico-financeiro/fluxo-caixa?empresa_id&hist&hor&centros=1,2 -> dados do painel do Fluxo de
//       Caixa (fluxoCaixaPainel.service.js). A empresa é conferida pelo authMiddleware (query).

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

const painelSchema = z.object({
  empresa_id: z.coerce.number().int().positive(),
  // hist = meses antes do atual (0 = o período começa no mês atual); hor = do atual em diante.
  hist: z.coerce.number().int().min(0).max(36).default(1),
  hor: z.coerce.number().int().min(1).max(36).default(5),
  centros: z
    .string()
    .regex(/^(\d+(,\d+)*)?$/)
    .optional()
    .default(''),
});

router.get('/economico-financeiro/fluxo-caixa', async (req, res, next) => {
  try {
    const f = painelSchema.parse(req.query);
    const centros = f.centros ? f.centros.split(',').map(Number) : [];
    res.json(await fluxoCaixaPainel.painel(f.empresa_id, { hist: f.hist, hor: f.hor, centros }));
  } catch (err) {
    if (err.issues) return res.status(400).json({ message: 'Filtros inválidos (período: até 36 meses antes do mês atual e até 35 depois).' });
    next(err);
  }
});

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
