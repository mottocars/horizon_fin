const pool = require('../../config/db');
const { encrypt } = require('../../utils/crypto');

async function list({ page = 1, limit = 10, search = '', ativo, empresaIds }) {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;
  const conditions = ['(e.razao_social ILIKE $1 OR s.username ILIKE $1 OR s.tenant ILIKE $1)'];
  const params = [searchTerm];

  if (ativo !== undefined) {
    params.push(ativo);
    conditions.push(`s.ativo = $${params.length}`);
  }

  if (Array.isArray(empresaIds)) {
    params.push(empresaIds);
    conditions.push(`s.empresa_id = ANY($${params.length}::int[])`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `SELECT s.id, s.tenant, s.username, s.ativo, s.criado_em, s.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_sienge s
     JOIN empresas e ON e.id = s.empresa_id
     ${whereClause}
     ORDER BY s.criado_em DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM integracoes_sienge s
     JOIN empresas e ON e.id = s.empresa_id
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
    `SELECT s.id, s.tenant, s.username, s.ativo, s.criado_em, s.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_sienge s
     JOIN empresas e ON e.id = s.empresa_id
     WHERE s.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function create({ empresa_id, tenant, username, password }) {
  const passwordEnc = encrypt(password);
  const { rows } = await pool.query(
    `INSERT INTO integracoes_sienge (empresa_id, tenant, username, password_enc)
     VALUES ($1, $2, $3, $4)
     RETURNING id, empresa_id, tenant, username, ativo, criado_em, atualizado_em`,
    [empresa_id, tenant, username, passwordEnc]
  );
  return rows[0];
}

async function update(id, { empresa_id, tenant, username, password }) {
  if (password) {
    const passwordEnc = encrypt(password);
    const { rows } = await pool.query(
      `UPDATE integracoes_sienge SET empresa_id = $1, tenant = $2, username = $3, password_enc = $4
       WHERE id = $5
       RETURNING id, empresa_id, tenant, username, ativo, criado_em, atualizado_em`,
      [empresa_id, tenant, username, passwordEnc, id]
    );
    return rows[0] || null;
  }

  const { rows } = await pool.query(
    `UPDATE integracoes_sienge SET empresa_id = $1, tenant = $2, username = $3
     WHERE id = $4
     RETURNING id, empresa_id, tenant, username, ativo, criado_em, atualizado_em`,
    [empresa_id, tenant, username, id]
  );
  return rows[0] || null;
}

async function setAtivo(id, ativo) {
  const { rows } = await pool.query(
    `UPDATE integracoes_sienge SET ativo = $1 WHERE id = $2
     RETURNING id, empresa_id, tenant, username, ativo, criado_em, atualizado_em`,
    [ativo, id]
  );
  return rows[0] || null;
}

module.exports = { list, getById, create, update, setAtivo };
