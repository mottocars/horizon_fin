const pool = require('../../config/db');
const { encrypt } = require('../../utils/crypto');

async function list({ page = 1, limit = 10, search = '', ativo, empresaIds }) {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;
  const conditions = ['(e.razao_social ILIKE $1 OR cv.email ILIKE $1 OR cv.tenant ILIKE $1)'];
  const params = [searchTerm];

  if (ativo !== undefined) {
    params.push(ativo);
    conditions.push(`cv.ativo = $${params.length}`);
  }

  if (Array.isArray(empresaIds)) {
    params.push(empresaIds);
    conditions.push(`cv.empresa_id = ANY($${params.length}::int[])`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `SELECT cv.id, cv.tenant, cv.email, cv.ativo, cv.criado_em, cv.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_construtor_vendas cv
     JOIN empresas e ON e.id = cv.empresa_id
     ${whereClause}
     ORDER BY cv.criado_em DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM integracoes_construtor_vendas cv
     JOIN empresas e ON e.id = cv.empresa_id
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
    `SELECT cv.id, cv.tenant, cv.email, cv.ativo, cv.criado_em, cv.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_construtor_vendas cv
     JOIN empresas e ON e.id = cv.empresa_id
     WHERE cv.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function create({ empresa_id, tenant, email, password }) {
  const senhaEnc = encrypt(password);
  const { rows } = await pool.query(
    `INSERT INTO integracoes_construtor_vendas (empresa_id, tenant, email, senha_enc)
     VALUES ($1, $2, $3, $4)
     RETURNING id, empresa_id, tenant, email, ativo, criado_em, atualizado_em`,
    [empresa_id, tenant, email, senhaEnc]
  );
  return rows[0];
}

async function update(id, { empresa_id, tenant, email, password }) {
  if (password) {
    const senhaEnc = encrypt(password);
    const { rows } = await pool.query(
      `UPDATE integracoes_construtor_vendas SET empresa_id = $1, tenant = $2, email = $3, senha_enc = $4
       WHERE id = $5
       RETURNING id, empresa_id, tenant, email, ativo, criado_em, atualizado_em`,
      [empresa_id, tenant, email, senhaEnc, id]
    );
    return rows[0] || null;
  }

  const { rows } = await pool.query(
    `UPDATE integracoes_construtor_vendas SET empresa_id = $1, tenant = $2, email = $3
     WHERE id = $4
     RETURNING id, empresa_id, tenant, email, ativo, criado_em, atualizado_em`,
    [empresa_id, tenant, email, id]
  );
  return rows[0] || null;
}

async function setAtivo(id, ativo) {
  const { rows } = await pool.query(
    `UPDATE integracoes_construtor_vendas SET ativo = $1 WHERE id = $2
     RETURNING id, empresa_id, tenant, email, ativo, criado_em, atualizado_em`,
    [ativo, id]
  );
  return rows[0] || null;
}

// Credenciais pra chamar a API do CVCRM (ver cvcrm-api.client.js) — só a
// integração ATIVA da empresa serve pra sincronizar.
async function getCredenciaisAtivas(empresaId) {
  const { rows } = await pool.query(
    `SELECT tenant, email, senha_enc
     FROM integracoes_construtor_vendas
     WHERE empresa_id = $1 AND ativo = TRUE`,
    [empresaId]
  );
  return rows[0] || null;
}

module.exports = { list, getById, create, update, setAtivo, getCredenciaisAtivas };
