const pool = require('../../config/db');
const { paisDoIp } = require('../../utils/paisDoIp');

function paraISODate(data) {
  return data.toISOString().slice(0, 10);
}

// Sem período informado, o dashboard abre nos últimos 30 dias (hoje incluso).
function periodoPadrao() {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 29);
  return { dataInicio: paraISODate(inicio), dataFim: paraISODate(fim) };
}

async function registrar(usuarioId, tela) {
  const { rows } = await pool.query(
    `INSERT INTO logs_acesso (usuario_id, tela) VALUES ($1, $2) RETURNING id, criado_em`,
    [usuarioId, tela]
  );
  return rows[0];
}

// Quem não é Master só enxerga o uso dos usuários das próprias empresas
// ($3 = empresas de quem consulta; NULL = Master, sem filtro).
const FILTRO_USUARIOS = (coluna) =>
  `($3::int[] IS NULL OR ${coluna} IN (SELECT ue.usuario_id FROM usuarios_empresas ue WHERE ue.empresa_id = ANY($3::int[])))`;

// Agrega tudo que o dashboard de Métricas de Uso precisa numa chamada só —
// resumo, ranking por tela (ordem das colunas do heatmap), a matriz
// usuário x tela (heatmap) e "como cada usuário acessa" (navegador,
// celular, Postman, script... — ver utils/clienteHttp.js). As consultas
// não dependem uma da outra, então rodam em paralelo.
async function metricas({ dataInicio, dataFim }, empresaIds = null) {
  const periodo = dataInicio && dataFim ? { dataInicio, dataFim } : periodoPadrao();
  const params = [periodo.dataInicio, periodo.dataFim, empresaIds];

  const [resumoResult, porTelaResult, matrizResult, clientesResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total_acessos,
              COUNT(DISTINCT usuario_id)::int AS usuarios_ativos,
              COUNT(DISTINCT tela)::int AS telas_acessadas
       FROM logs_acesso
       WHERE criado_em::date BETWEEN $1 AND $2 AND ${FILTRO_USUARIOS('usuario_id')}`,
      params
    ),
    pool.query(
      `SELECT tela, COUNT(*)::int AS total
       FROM logs_acesso
       WHERE criado_em::date BETWEEN $1 AND $2 AND ${FILTRO_USUARIOS('usuario_id')}
       GROUP BY tela
       ORDER BY total DESC, tela ASC`,
      params
    ),
    pool.query(
      `SELECT la.usuario_id, u.nome AS usuario_nome, la.tela, COUNT(*)::int AS total
       FROM logs_acesso la
       JOIN usuarios u ON u.id = la.usuario_id
       WHERE la.criado_em::date BETWEEN $1 AND $2 AND ${FILTRO_USUARIOS('la.usuario_id')}
       GROUP BY la.usuario_id, u.nome, la.tela
       ORDER BY u.nome ASC, la.tela ASC`,
      params
    ),
    // 1 linha por usuário + tipo de cliente + detalhe (ex.: "Chrome ·
    // Windows", "PostmanRuntime/7.43.0"), somando os dias do período.
    pool.query(
      `SELECT c.usuario_id, u.nome AS usuario_nome, c.tipo, c.detalhe,
              SUM(c.total)::int AS requisicoes,
              COUNT(DISTINCT c.dia)::int AS dias,
              ARRAY_AGG(DISTINCT c.ip) FILTER (WHERE c.ip IS NOT NULL AND c.ip <> '') AS ips,
              (ARRAY_AGG(c.user_agent ORDER BY c.ultimo_em DESC))[1] AS user_agent,
              MIN(c.primeiro_em) AS primeiro_em,
              MAX(c.ultimo_em) AS ultimo_em
       FROM logs_acesso_clientes c
       JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.dia BETWEEN $1 AND $2 AND ${FILTRO_USUARIOS('c.usuario_id')}
       GROUP BY c.usuario_id, u.nome, c.tipo, c.detalhe
       ORDER BY u.nome ASC, requisicoes DESC`,
      params
    ),
  ]);

  return {
    periodo,
    resumo: {
      totalAcessos: resumoResult.rows[0].total_acessos,
      usuariosAtivos: resumoResult.rows[0].usuarios_ativos,
      telasAcessadas: resumoResult.rows[0].telas_acessadas,
      telaMaisAcessada: porTelaResult.rows[0] || null,
    },
    porTela: porTelaResult.rows,
    matriz: matrizResult.rows,
    // País calculado na hora (não gravado) — assim os acessos antigos também
    // ganham país. `ips` vira [{ ip, pais }]; `paises` = países distintos.
    clientes: clientesResult.rows.map((c) => {
      const ips = (c.ips || []).map((ip) => ({ ip, pais: paisDoIp(ip) }));
      return { ...c, ips, paises: [...new Set(ips.map((i) => i.pais).filter(Boolean))] };
    }),
  };
}

module.exports = { registrar, metricas };
