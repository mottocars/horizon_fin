const pool = require('../../config/db');

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

async function list(empresaId) {
  const { rows } = await pool.query(
    `SELECT id, nome, prioridade_sem_saldo, criado_em, atualizado_em
     FROM classificacoes_bancarias WHERE empresa_id = $1 ORDER BY nome ASC`,
    [empresaId]
  );
  return rows;
}

async function create(empresaId, { nome, prioridadeSemSaldo }) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO classificacoes_bancarias (empresa_id, nome, prioridade_sem_saldo)
       VALUES ($1, $2, $3)
       RETURNING id, nome, prioridade_sem_saldo, criado_em, atualizado_em`,
      [empresaId, nome, prioridadeSemSaldo]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw erro(409, 'Já existe uma classificação com esse nome nesta empresa.');
    throw err;
  }
}

async function update(id, empresaId, { nome, prioridadeSemSaldo }) {
  try {
    const { rows } = await pool.query(
      `UPDATE classificacoes_bancarias SET nome = $3, prioridade_sem_saldo = $4, atualizado_em = NOW()
       WHERE id = $1 AND empresa_id = $2
       RETURNING id, nome, prioridade_sem_saldo, criado_em, atualizado_em`,
      [id, empresaId, nome, prioridadeSemSaldo]
    );
    return rows[0] || null;
  } catch (err) {
    if (err.code === '23505') throw erro(409, 'Já existe uma classificação com esse nome nesta empresa.');
    throw err;
  }
}

// Não bloqueia remover uma classificação já usada por contas — o vínculo é por nome (texto),
// sem FK; contas que já tinham esse nome continuam com o texto salvo (viram "sem prioridade
// configurada" pra fins de saldo automático, mesmo efeito de nunca ter sido classificada
// assim), sem quebrar nada e sem exigir uma tela de "mover contas pra outra classificação".
async function remove(id, empresaId) {
  const { rows } = await pool.query(`DELETE FROM classificacoes_bancarias WHERE id = $1 AND empresa_id = $2 RETURNING id`, [
    id,
    empresaId,
  ]);
  return !!rows[0];
}

// Usado pelo cadastro de Contas Bancárias (validar o texto digitado) e pela busca automática
// de saldo (saber a prioridade configurada por nome de classificação desta empresa).
async function mapaPorNome(empresaId) {
  const { rows } = await pool.query(`SELECT nome, prioridade_sem_saldo FROM classificacoes_bancarias WHERE empresa_id = $1`, [
    empresaId,
  ]);
  return new Map(rows.map((r) => [r.nome, r.prioridade_sem_saldo]));
}

module.exports = { list, create, update, remove, mapaPorNome };
