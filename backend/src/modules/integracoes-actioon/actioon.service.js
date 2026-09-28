const pool = require('../../config/db');
const { encrypt } = require('../../utils/crypto');

async function list({ page = 1, limit = 10, search = '', ativo, empresaIds }) {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;
  const conditions = ['(e.razao_social ILIKE $1 OR a.email ILIKE $1)'];
  const params = [searchTerm];

  if (ativo !== undefined) {
    params.push(ativo);
    conditions.push(`a.ativo = $${params.length}`);
  }

  if (Array.isArray(empresaIds)) {
    params.push(empresaIds);
    conditions.push(`a.empresa_id = ANY($${params.length}::int[])`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `SELECT a.id, a.email, a.ativo, a.criado_em, a.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_actioon a
     JOIN empresas e ON e.id = a.empresa_id
     ${whereClause}
     ORDER BY a.criado_em DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM integracoes_actioon a
     JOIN empresas e ON e.id = a.empresa_id
     ${whereClause}`,
    params
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
  const { rows } = await pool.query(
    `SELECT a.id, a.email, a.ativo, a.criado_em, a.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_actioon a
     JOIN empresas e ON e.id = a.empresa_id
     WHERE a.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function create({ empresa_id, email, password }) {
  const senhaEnc = encrypt(password);
  const { rows } = await pool.query(
    `INSERT INTO integracoes_actioon (empresa_id, email, senha_enc)
     VALUES ($1, $2, $3)
     RETURNING id, empresa_id, email, ativo, criado_em, atualizado_em`,
    [empresa_id, email, senhaEnc]
  );
  return rows[0];
}

async function update(id, { empresa_id, email, password }) {
  if (password) {
    const senhaEnc = encrypt(password);
    const { rows } = await pool.query(
      `UPDATE integracoes_actioon SET empresa_id = $1, email = $2, senha_enc = $3
       WHERE id = $4
       RETURNING id, empresa_id, email, ativo, criado_em, atualizado_em`,
      [empresa_id, email, senhaEnc, id]
    );
    return rows[0] || null;
  }

  const { rows } = await pool.query(
    `UPDATE integracoes_actioon SET empresa_id = $1, email = $2
     WHERE id = $3
     RETURNING id, empresa_id, email, ativo, criado_em, atualizado_em`,
    [empresa_id, email, id]
  );
  return rows[0] || null;
}

async function setAtivo(id, ativo) {
  const { rows } = await pool.query(
    `UPDATE integracoes_actioon SET ativo = $1 WHERE id = $2
     RETURNING id, empresa_id, email, ativo, criado_em, atualizado_em`,
    [ativo, id]
  );
  return rows[0] || null;
}

module.exports = { list, getById, create, update, setAtivo };
