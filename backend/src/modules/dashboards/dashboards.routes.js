const zlib = require('zlib');
const { promisify } = require('util');
const { Router } = require('express');
const { z } = require('zod');
const pool = require('../../config/db');
const authMiddleware = require('../../middlewares/auth.middleware');
const fluxoCaixaPainel = require('./fluxoCaixaPainel.service');
const agingPainel = require('./agingPainel.service');

// Dashboards: tela favorita (estrela) de cada usuário em cada dashboard — a que abre ao entrar pelo
// menu. Cada usuário só lê e grava a própria. Montado em server.js com exigirTela dos dashboards.
//   GET /:dashboard/favorita            -> { tela | null }
//   PUT /:dashboard/favorita { tela }   -> { tela } (tela null = tira a favorita)
//   GET /economico-financeiro/fluxo-caixa?empresa_id&hist&hor&centros=1,2 -> dados do painel do Fluxo de
//       Caixa (fluxoCaixaPainel.service.js). A empresa é conferida pelo authMiddleware (query).
//   GET /economico-financeiro/aging?empresa_id -> parcelas em aberto a receber e a pagar (com rateio) e o
//       saldo bancário de hoje, para o Aging List (agingPainel.service.js).
//   Filtros salvos do usuário numa tela, por empresa (botão "Gravar filtro" / lista "Filtros salvos"):
//   GET    /:dashboard/:tela/filtros?empresa_id            -> [{ id, nome, filtros }]
//   POST   /:dashboard/:tela/filtros { empresa_id, nome, filtros } -> { id, nome, filtros } (mesmo nome substitui)
//   DELETE /:dashboard/:tela/filtros/:id                   -> 204 (só os do próprio usuário)

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

router.get('/economico-financeiro/aging', async (req, res, next) => {
  try {
    const { empresa_id: empresaId } = z.object({ empresa_id: z.coerce.number().int().positive() }).parse(req.query);
    const dados = await agingPainel.painel(empresaId);
    // Todas as parcelas em aberto vão juntas (a GENESIS passa de 15 mil, ~3 MB): gzip aqui, que o
    // servidor não comprime as respostas da API.
    if (!/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return res.json(dados);
    const corpo = await promisify(zlib.gzip)(JSON.stringify(dados));
    res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' }).send(corpo);
  } catch (err) {
    if (err.issues) return res.status(400).json({ message: 'Escolha a empresa.' });
    next(err);
  }
});

// Tela que aceita filtros salvos e o formato do que ela grava.
const lista = (item) => z.array(item).max(5000).default([]);
const FILTROS_SALVOS = {
  'economico-financeiro/aging': z.object({
    // Período em meses a partir do mês atual (para trás / para frente); ao aplicar o filtro, refaz o
    // Início/Fim da tela. null = o filtro não mexe naquele lado do período.
    historico: z.number().int().min(0).max(360).nullable().optional(),
    horizonte: z.number().int().min(0).max(360).nullable().optional(),
    centros: lista(z.number().int()),
    documentos: lista(z.string().max(50)),
    naturezas: lista(z.string().max(50)),
    clientes: lista(z.number().int()),
    fornecedores: lista(z.number().int()),
    // Listas no "Marcar todos": nelas a lista guarda os desmarcados (todos, menos esses).
    exceto: z.array(z.enum(['documentos', 'naturezas', 'clientes', 'fornecedores'])).max(4).default([]),
    previsao: z.enum(['nao', 'sim', 'todos']).default('nao'),
  }),
};

function telaComFiltros(req, res) {
  const schema = FILTROS_SALVOS[`${req.params.dashboard}/${req.params.tela}`];
  if (!schema) res.status(404).json({ message: 'Esta tela não tem filtros salvos.' });
  return schema;
}

router.get('/:dashboard/:tela/filtros', async (req, res, next) => {
  try {
    if (!telaComFiltros(req, res)) return;
    const { empresa_id: empresaId } = z.object({ empresa_id: z.coerce.number().int().positive() }).parse(req.query);
    const { rows } = await pool.query(
      `SELECT id, nome, filtros FROM usuarios_dashboard_filtros
        WHERE usuario_id = $1 AND empresa_id = $2 AND dashboard = $3 AND tela = $4 ORDER BY lower(nome)`,
      [req.user.id, empresaId, req.params.dashboard, req.params.tela]
    );
    res.json(rows);
  } catch (err) {
    if (err.issues) return res.status(400).json({ message: 'Escolha a empresa.' });
    next(err);
  }
});

router.post('/:dashboard/:tela/filtros', async (req, res, next) => {
  try {
    const schema = telaComFiltros(req, res);
    if (!schema) return;
    const corpo = z
      .object({ empresa_id: z.coerce.number().int().positive(), nome: z.string().trim().min(1).max(80), filtros: schema })
      .parse(req.body || {});
    const { rows } = await pool.query(
      `INSERT INTO usuarios_dashboard_filtros (usuario_id, empresa_id, dashboard, tela, nome, filtros)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (usuario_id, empresa_id, dashboard, tela, nome)
       DO UPDATE SET filtros = EXCLUDED.filtros, atualizado_em = NOW()
       RETURNING id, nome, filtros`,
      [req.user.id, corpo.empresa_id, req.params.dashboard, req.params.tela, corpo.nome, JSON.stringify(corpo.filtros)]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.issues) return res.status(400).json({ message: 'Informe o nome do filtro (até 80 caracteres).' });
    next(err);
  }
});

router.delete('/:dashboard/:tela/filtros/:id', async (req, res, next) => {
  try {
    if (!telaComFiltros(req, res)) return;
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { rowCount } = await pool.query(
      'DELETE FROM usuarios_dashboard_filtros WHERE id = $1 AND usuario_id = $2 AND dashboard = $3 AND tela = $4',
      [id, req.user.id, req.params.dashboard, req.params.tela]
    );
    if (!rowCount) return res.status(404).json({ message: 'Filtro não encontrado.' });
    res.status(204).end();
  } catch (err) {
    if (err.issues) return res.status(400).json({ message: 'Filtro inválido.' });
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
