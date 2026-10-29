const pool = require('../../config/db');

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

async function list(empresaId) {
  const { rows } = await pool.query(
    `SELECT id, nome, prioridade_sem_saldo, descricao, libera_saldo, criado_em, atualizado_em
     FROM classificacoes_bancarias WHERE empresa_id = $1 ORDER BY nome ASC`,
    [empresaId]
  );
  return rows;
}

async function create(empresaId, { nome, prioridadeSemSaldo, descricao, liberaSaldo }) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO classificacoes_bancarias (empresa_id, nome, prioridade_sem_saldo, descricao, libera_saldo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, prioridade_sem_saldo, descricao, libera_saldo, criado_em, atualizado_em`,
      [empresaId, nome, prioridadeSemSaldo, descricao, liberaSaldo]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw erro(409, 'Já existe uma classificação com esse nome nesta empresa.');
    throw err;
  }
}

async function update(id, empresaId, { nome, prioridadeSemSaldo, descricao, liberaSaldo }) {
  try {
    const { rows } = await pool.query(
      `UPDATE classificacoes_bancarias SET nome = $3, prioridade_sem_saldo = $4, descricao = $5, libera_saldo = $6,
           atualizado_em = NOW()
       WHERE id = $1 AND empresa_id = $2
       RETURNING id, nome, prioridade_sem_saldo, descricao, libera_saldo, criado_em, atualizado_em`,
      [id, empresaId, nome, prioridadeSemSaldo, descricao, liberaSaldo]
    );
    return rows[0] || null;
  } catch (err) {
    if (err.code === '23505') throw erro(409, 'Já existe uma classificação com esse nome nesta empresa.');
    throw err;
  }
}

// As contas apontam para a classificação pelo id (contas_bancarias_sienge.classificacao_id, FK
// RESTRICT): com conta usando, não remove — troque a classificação das contas antes. Renomear é
// livre (o nome é lido do cadastro).
async function remove(id, empresaId) {
  const { rows: uso } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM contas_bancarias_sienge WHERE empresa_id = $2 AND classificacao_id = $1',
    [id, empresaId]
  );
  if (uso[0].n > 0) {
    throw erro(409, `${uso[0].n} conta(s) bancária(s) usam esta classificação — troque a classificação delas antes de remover.`);
  }
  const { rows } = await pool.query(`DELETE FROM classificacoes_bancarias WHERE id = $1 AND empresa_id = $2 RETURNING id`, [
    id,
    empresaId,
  ]);
  return !!rows[0];
}

module.exports = { list, create, update, remove };
