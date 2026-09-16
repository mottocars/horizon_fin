const pool = require('../../config/db');

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

// Agrega tudo que o dashboard de Métricas de Uso precisa numa chamada só —
// resumo, série diária (tendência), ranking por tela e a matriz usuário x
// tela (heatmap). As 4 consultas não dependem uma da outra, então rodam em
// paralelo em vez de sequenciais.
async function metricas({ dataInicio, dataFim }) {
  const periodo = dataInicio && dataFim ? { dataInicio, dataFim } : periodoPadrao();
  const params = [periodo.dataInicio, periodo.dataFim];

  const [resumoResult, porDiaResult, porTelaResult, matrizResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total_acessos,
              COUNT(DISTINCT usuario_id)::int AS usuarios_ativos,
              COUNT(DISTINCT tela)::int AS telas_acessadas
       FROM logs_acesso
       WHERE criado_em::date BETWEEN $1 AND $2`,
      params
    ),
    // generate_series preenche os dias sem nenhum acesso com 0 — sem isso a
    // linha do gráfico de tendência "pula" direto de uma quinta pra uma
    // segunda quando não houve acesso no fim de semana, como se os dias
    // fossem consecutivos.
    pool.query(
      `SELECT gs.dia::text AS data, COALESCE(t.total, 0)::int AS total
       FROM generate_series($1::date, $2::date, interval '1 day') AS gs(dia)
       LEFT JOIN (
         SELECT criado_em::date AS dia, COUNT(*) AS total
         FROM logs_acesso
         WHERE criado_em::date BETWEEN $1 AND $2
         GROUP BY criado_em::date
       ) t ON t.dia = gs.dia
       ORDER BY gs.dia`,
      params
    ),
    pool.query(
      `SELECT tela, COUNT(*)::int AS total
       FROM logs_acesso
       WHERE criado_em::date BETWEEN $1 AND $2
       GROUP BY tela
       ORDER BY total DESC, tela ASC`,
      params
    ),
    pool.query(
      `SELECT la.usuario_id, u.nome AS usuario_nome, la.tela, COUNT(*)::int AS total
       FROM logs_acesso la
       JOIN usuarios u ON u.id = la.usuario_id
       WHERE la.criado_em::date BETWEEN $1 AND $2
       GROUP BY la.usuario_id, u.nome, la.tela
       ORDER BY u.nome ASC, la.tela ASC`,
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
    porDia: porDiaResult.rows,
    porTela: porTelaResult.rows,
    matriz: matrizResult.rows,
  };
}

module.exports = { registrar, metricas };
