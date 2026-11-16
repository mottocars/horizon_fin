const pool = require('../../config/db');

// DFC Construtoras › aba Dívida PJ: o valor da dívida PJ de cada centro de custo, mês a mês (tabela
// dfc_divida_pj) — mesma mecânica da aba Orçamento da DRE Gerencial (dre-orcamento), com um valor só
// por mês em vez de uma coluna por categoria.

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Sempre o dia 1 do mês.
const primeiroDiaDoMes = (iso) => `${iso.slice(0, 7)}-01`;

// Os meses de um centro, do mais antigo ao mais novo: [{ mes: 'AAAA-MM-01', valor }].
async function listPorCentroCusto(empresaId, siengeId) {
  const { rows } = await pool.query(
    `SELECT TO_CHAR(mes, 'YYYY-MM-DD') AS mes, valor
     FROM dfc_divida_pj
     WHERE empresa_id = $1 AND sienge_id = $2
     ORDER BY mes ASC`,
    [empresaId, siengeId]
  );
  return rows.map((r) => ({ mes: r.mes, valor: Number(r.valor) }));
}

// O mês mais recente de cada centro (a linha do centro, fechada, mostra ele):
// { [sienge_id]: { mes, valor } } — só os centros com algum mês cadastrado.
async function listVigentesPorEmpresa(empresaId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (sienge_id) sienge_id, TO_CHAR(mes, 'YYYY-MM-DD') AS mes, valor
     FROM dfc_divida_pj
     WHERE empresa_id = $1
     ORDER BY sienge_id, mes DESC`,
    [empresaId]
  );
  return Object.fromEntries(rows.map((r) => [r.sienge_id, { mes: r.mes, valor: Number(r.valor) }]));
}

// Cria (mês novo) ou atualiza (mês que já existe) o valor do mês.
async function salvar(empresaId, siengeId, mes, valor) {
  try {
    await pool.query(
      `INSERT INTO dfc_divida_pj (empresa_id, sienge_id, mes, valor)
       VALUES ($1, $2, $3::date, $4)
       ON CONFLICT (empresa_id, sienge_id, mes)
       DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`,
      [empresaId, siengeId, primeiroDiaDoMes(mes), valor.toFixed(2)]
    );
  } catch (err) {
    // 23503 = FK violada — centro de custo não existe (ou é de outra empresa).
    if (err.code === '23503') throw erro(400, 'Centro de custo inválido.');
    throw err;
  }
}

async function remover(empresaId, siengeId, mes) {
  const { rowCount } = await pool.query(
    `DELETE FROM dfc_divida_pj WHERE empresa_id = $1 AND sienge_id = $2 AND mes = $3::date`,
    [empresaId, siengeId, primeiroDiaDoMes(mes)]
  );
  return rowCount > 0;
}

module.exports = { listPorCentroCusto, listVigentesPorEmpresa, salvar, remover };
