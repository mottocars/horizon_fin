const pool = require('../../config/db');

async function list({ page = 1, limit = 10, search = '' }) {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;

  const { rows } = await pool.query(
    `SELECT id, nome, email, telefone, criado_em, atualizado_em
     FROM clientes
     WHERE nome ILIKE $1 OR email ILIKE $1
     ORDER BY nome ASC
     LIMIT $2 OFFSET $3`,
    [searchTerm, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM clientes WHERE nome ILIKE $1 OR email ILIKE $1`,
    [searchTerm]
  );

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total: countRows[0].total,
      totalPages: Math.max(1, Math.ceil(countRows[0].total / limit)),
    },
  };
}

async function getById(id) {
  const { rows } = await pool.query('SELECT * FROM clientes WHERE id = $1', [id]);
  return rows[0] || null;
}

async function create({ nome, email, telefone }) {
  const { rows } = await pool.query(
    `INSERT INTO clientes (nome, email, telefone) VALUES ($1, $2, $3) RETURNING *`,
    [nome, email, telefone || null]
  );
  return rows[0];
}

async function update(id, { nome, email, telefone }) {
  const { rows } = await pool.query(
    `UPDATE clientes SET nome = $1, email = $2, telefone = $3 WHERE id = $4 RETURNING *`,
    [nome, email, telefone || null, id]
  );
  return rows[0] || null;
}

async function remove(id) {
  const { rowCount } = await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { list, getById, create, update, remove };
