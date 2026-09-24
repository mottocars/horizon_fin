const pool = require('../../config/db');

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Sempre o dia 1 do mês — o orçamento é mensal, não faz sentido um "início" no meio do mês
// (pedido do usuário: "eu trato sempre que o mês é de quem iniciou").
function primeiroDiaDoMes(iso) {
  return `${iso.slice(0, 7)}-01`;
}

// Um orçamento = o conjunto de linhas que compartilha (empresa_id, sienge_id, data_inicio) —
// agrupa aqui em vez de manter uma tabela de "cabeçalho" de versão separada.
async function listPorCentroCusto(empresaId, siengeId) {
  const { rows } = await pool.query(
    `SELECT TO_CHAR(data_inicio, 'YYYY-MM-DD') AS data_inicio, categoria_id, valor
     FROM dre_orcamento_valores
     WHERE empresa_id = $1 AND sienge_id = $2
     ORDER BY data_inicio ASC`,
    [empresaId, siengeId]
  );

  const porData = new Map();
  for (const r of rows) {
    if (!porData.has(r.data_inicio)) porData.set(r.data_inicio, {});
    porData.get(r.data_inicio)[r.categoria_id] = Number(r.valor);
  }
  return [...porData.entries()].map(([data_inicio, valores]) => ({ data_inicio, valores }));
}

// O orçamento vigente de cada centro de custo = o de `data_inicio` mais recente (o "último
// orçamento gerado", pedido do usuário) — usado na linha-resumo (nível 0) do drilldown, sem
// precisar expandir. Só entram centros que já têm pelo menos 1 orçamento lançado.
async function listVigentesPorEmpresa(empresaId) {
  const { rows } = await pool.query(
    `WITH ultimos AS (
       SELECT sienge_id, MAX(data_inicio) AS data_inicio
       FROM dre_orcamento_valores
       WHERE empresa_id = $1
       GROUP BY sienge_id
     )
     SELECT v.sienge_id, TO_CHAR(v.data_inicio, 'YYYY-MM-DD') AS data_inicio, v.categoria_id, v.valor
     FROM dre_orcamento_valores v
     JOIN ultimos u ON u.sienge_id = v.sienge_id AND u.data_inicio = v.data_inicio
     WHERE v.empresa_id = $1`,
    [empresaId]
  );

  const porCentro = new Map();
  for (const r of rows) {
    if (!porCentro.has(r.sienge_id)) porCentro.set(r.sienge_id, { data_inicio: r.data_inicio, valores: {} });
    porCentro.get(r.sienge_id).valores[r.categoria_id] = Number(r.valor);
  }
  return Object.fromEntries(porCentro);
}

// Cria (se `dataInicio` for novo) ou atualiza (se já existir) o orçamento daquele mês — grava
// só as categorias informadas em `itens`, nunca mexe nas outras já gravadas pra esse mesmo mês.
// Serve tanto pra "novo orçamento" (manda as 5 categorias de uma vez, mesmo que com valor 0)
// quanto pra editar 1 célula isolada (manda só 1 item).
async function salvar(empresaId, siengeId, dataInicio, itens) {
  if (!itens.length) return;
  const dataNormalizada = primeiroDiaDoMes(dataInicio);
  try {
    await pool.query(
      `INSERT INTO dre_orcamento_valores (empresa_id, sienge_id, data_inicio, categoria_id, valor)
       SELECT $1, $2, $3::date, t.categoria_id, t.valor
       FROM unnest($4::int[], $5::numeric[]) AS t(categoria_id, valor)
       ON CONFLICT (empresa_id, sienge_id, data_inicio, categoria_id)
       DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`,
      [empresaId, siengeId, dataNormalizada, itens.map((i) => i.categoria_id), itens.map((i) => i.valor.toFixed(2))]
    );
  } catch (err) {
    // 23503 = FK violada — centro de custo ou categoria não existe (ou é de outra empresa).
    if (err.code === '23503') throw erro(400, 'Centro de custo ou categoria inválidos.');
    throw err;
  }
}

async function remover(empresaId, siengeId, dataInicio) {
  const { rowCount } = await pool.query(
    `DELETE FROM dre_orcamento_valores WHERE empresa_id = $1 AND sienge_id = $2 AND data_inicio = $3::date`,
    [empresaId, siengeId, primeiroDiaDoMes(dataInicio)]
  );
  return rowCount > 0;
}

module.exports = { listPorCentroCusto, listVigentesPorEmpresa, salvar, remover };
