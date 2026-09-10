const crypto = require('crypto');
const pool = require('../../config/db');
const env = require('../../config/env');
const { encrypt, decrypt } = require('../../utils/crypto');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

function gerarToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Monta a URL completa que a tela de Integrações > MCP mostra — nunca o
// token separado (ver plano: o usuário quer a URL sempre visível/copiável,
// não o segredo cru ao lado dela).
function getUrlCompleta(row) {
  const token = decrypt(row.token_enc);
  return `${env.mcp.publicBaseUrl}/api/mcp/${token}`;
}

function formatarItem(row) {
  const { token_enc, token_hash, ...resto } = row;
  return { ...resto, url: getUrlCompleta(row) };
}

async function list({ page = 1, limit = 10, search = '', ativo, empresaIds }) {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;
  const conditions = ['(e.razao_social ILIKE $1 OR m.nome_conector ILIKE $1)'];
  const params = [searchTerm];

  if (ativo !== undefined) {
    params.push(ativo);
    conditions.push(`m.ativo = $${params.length}`);
  }

  if (Array.isArray(empresaIds)) {
    params.push(empresaIds);
    conditions.push(`m.empresa_id = ANY($${params.length}::int[])`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `SELECT m.id, m.nome_conector, m.token_enc, m.token_hash, m.ativo, m.ultimo_uso_em, m.criado_em, m.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_mcp m
     JOIN empresas e ON e.id = m.empresa_id
     ${whereClause}
     ORDER BY m.criado_em DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM integracoes_mcp m
     JOIN empresas e ON e.id = m.empresa_id
     ${whereClause}`,
    params
  );

  return {
    data: rows.map(formatarItem),
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
    `SELECT m.id, m.nome_conector, m.token_enc, m.token_hash, m.ativo, m.ultimo_uso_em, m.criado_em, m.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_mcp m
     JOIN empresas e ON e.id = m.empresa_id
     WHERE m.id = $1`,
    [id]
  );
  const row = rows[0];
  return row ? formatarItem(row) : null;
}

async function create({ empresa_id, nome_conector }) {
  const token = gerarToken();
  const { rows } = await pool.query(
    `INSERT INTO integracoes_mcp (empresa_id, nome_conector, token_hash, token_enc)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [empresa_id, nome_conector, hashToken(token), encrypt(token)]
  );
  return getById(rows[0].id);
}

async function update(id, { nome_conector }) {
  const { rows } = await pool.query(
    `UPDATE integracoes_mcp SET nome_conector = $1 WHERE id = $2 RETURNING id`,
    [nome_conector, id]
  );
  return rows[0] ? getById(id) : null;
}

async function setAtivo(id, ativo) {
  const { rows } = await pool.query(`UPDATE integracoes_mcp SET ativo = $1 WHERE id = $2 RETURNING id`, [ativo, id]);
  return rows[0] ? getById(id) : null;
}

// Gera um token novo e substitui o antigo na hora — a URL anterior para de
// funcionar imediatamente, sem período de graça (ver plano, risco #3).
async function regenerarToken(id) {
  const token = gerarToken();
  const { rows } = await pool.query(
    `UPDATE integracoes_mcp SET token_hash = $1, token_enc = $2 WHERE id = $3 RETURNING id`,
    [hashToken(token), encrypt(token), id]
  );
  return rows[0] ? getById(id) : null;
}

// Usada só pelo protocolo MCP em si (mcpProtocolo.routes.js), nunca pelo
// CRUD autenticado acima. Devolve o empresa_id se o token bate com uma
// conexão ativa, senão null — sem distinguir "não existe" de "inativo" pra
// quem chama (mesma mensagem genérica nos dois casos, ver rota).
async function resolverEmpresaPorToken(token) {
  const hash = hashToken(token);
  const { rows } = await pool.query('SELECT empresa_id, ativo FROM integracoes_mcp WHERE token_hash = $1', [hash]);
  const row = rows[0];
  if (!row || !row.ativo) return null;

  // Fire-and-forget: telemetria de uso nunca pode atrasar/derrubar a
  // resposta de uma pergunta legítima da diretoria.
  pool.query('UPDATE integracoes_mcp SET ultimo_uso_em = NOW() WHERE token_hash = $1', [hash]).catch(() => {});

  return row.empresa_id;
}

module.exports = { list, getById, create, update, setAtivo, regenerarToken, resolverEmpresaPorToken };
