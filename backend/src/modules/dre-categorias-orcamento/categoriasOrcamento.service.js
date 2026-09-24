const pool = require('../../config/db');

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

async function list(empresaId) {
  const { rows } = await pool.query(
    `SELECT id, nome, criado_em FROM dre_categorias_orcamento WHERE empresa_id = $1 ORDER BY nome ASC`,
    [empresaId]
  );
  return rows;
}

async function create(empresaId, { nome }) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO dre_categorias_orcamento (empresa_id, nome) VALUES ($1, $2) RETURNING id, nome, criado_em`,
      [empresaId, nome]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw erro(409, 'Já existe uma categoria com esse nome nesta empresa.');
    throw err;
  }
}

async function update(id, empresaId, { nome }) {
  try {
    const { rows } = await pool.query(
      `UPDATE dre_categorias_orcamento SET nome = $3 WHERE id = $1 AND empresa_id = $2 RETURNING id, nome, criado_em`,
      [id, empresaId, nome]
    );
    return rows[0] || null;
  } catch (err) {
    if (err.code === '23505') throw erro(409, 'Já existe uma categoria com esse nome nesta empresa.');
    throw err;
  }
}

async function remove(id, empresaId) {
  try {
    const { rows } = await pool.query(
      `DELETE FROM dre_categorias_orcamento WHERE id = $1 AND empresa_id = $2 RETURNING id`,
      [id, empresaId]
    );
    return !!rows[0];
  } catch (err) {
    // 23503 = já tem orçamento lançado pra essa categoria (dre_orcamento_valores, ON DELETE
    // RESTRICT de propósito — apagar a categoria não pode apagar histórico de orçamento junto).
    if (err.code === '23503') throw erro(409, 'Esta categoria já tem valores de orçamento lançados e não pode ser removida.');
    throw err;
  }
}

module.exports = { list, create, update, remove };
