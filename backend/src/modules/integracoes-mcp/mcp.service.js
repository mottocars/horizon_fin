const crypto = require('crypto');
const pool = require('../../config/db');
const env = require('../../config/env');
const { encrypt, decrypt } = require('../../utils/crypto');
const { MODULOS, normalizarModulos, modulosDoUsuario } = require('./modulos');

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
// Conector Horizon (escopo HORIZON, com módulos): /api/mcp/dfc/<token> (e exige login Horizon — ver
// dfc/oauth.routes.js; o caminho "dfc" ficou por compatibilidade com os conectores já criados).
function getUrlCompleta(row) {
  const token = decrypt(row.token_enc);
  return row.escopo === 'COBRANCA' ? `${env.mcp.publicBaseUrl}/api/mcp/${token}` : `${env.mcp.publicBaseUrl}/api/mcp/dfc/${token}`;
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
            m.escopo, m.sessao_horas, m.modulos,
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
            m.escopo, m.sessao_horas, m.modulos,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_mcp m
     JOIN empresas e ON e.id = m.empresa_id
     WHERE m.id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  const { rows: usuarios } = await pool.query(
    `SELECT u.id, u.nome FROM integracoes_mcp_usuarios mu JOIN usuarios u ON u.id = mu.usuario_id WHERE mu.conector_id = $1 ORDER BY u.nome`,
    [id]
  );
  return { ...formatarItem(row), usuarios, usuario_ids: usuarios.map((u) => u.id) };
}

// Colaboradores da empresa que podem ser liberados num conector: usuários ativos, não MASTER (MASTER
// pode sempre), vinculados à empresa. `modulos`: os módulos do conector Horizon que ele pode usar (tem a
// tela de cada um) — quem não tem nenhum dos módulos marcados não consegue entrar.
async function usuariosDaEmpresa(empresaId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nome, u.username, u.avatar_url, u.permissao, u.telas_permitidas
       FROM usuarios u JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = $1
      WHERE u.ativo AND u.permissao <> 'MASTER'
      ORDER BY u.nome`,
    [empresaId]
  );
  return rows.map(({ permissao, telas_permitidas: telas, ...u }) => ({
    ...u,
    modulos: modulosDoUsuario({ permissao, telas_permitidas: telas }, Object.keys(MODULOS)),
  }));
}

// Grava a lista de usuários liberados do conector (substitui a anterior). Só aceita colaboradores da
// empresa do conector (MASTER não precisa estar na lista).
async function definirUsuarios(conectorId, empresaId, usuarioIds, db = pool) {
  if (!Array.isArray(usuarioIds)) return;
  const permitidos = new Set((await usuariosDaEmpresa(empresaId)).map((u) => u.id));
  const invalidos = usuarioIds.filter((id) => !permitidos.has(id));
  if (invalidos.length) throw badRequest('Só dá para liberar colaboradores ativos desta empresa (usuários MASTER já têm acesso).');
  await db.query('DELETE FROM integracoes_mcp_usuarios WHERE conector_id = $1', [conectorId]);
  if (usuarioIds.length) {
    await db.query(
      'INSERT INTO integracoes_mcp_usuarios (conector_id, usuario_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING',
      [conectorId, [...new Set(usuarioIds)]]
    );
  }
}

// "Conexões com IA" do usuário logado (ícone ao lado da foto): MASTER vê todos os conectores ativos;
// os demais, os ativos em que estão liberados, da empresa a que têm acesso — e, nos conectores Horizon,
// só se tiverem a tela de algum dos módulos (senão o login recusaria). `modulos` = os que ele recebe.
async function minhasConexoes(user) {
  const master = user.permissao === 'MASTER';
  const { rows } = await pool.query(
    `SELECT m.id, m.nome_conector, m.token_enc, m.escopo, m.sessao_horas, m.ultimo_uso_em, m.modulos,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa, e.logo AS empresa_logo
       FROM integracoes_mcp m JOIN empresas e ON e.id = m.empresa_id
      WHERE m.ativo
        AND ($1 OR EXISTS (SELECT 1 FROM integracoes_mcp_usuarios mu WHERE mu.conector_id = m.id AND mu.usuario_id = $2))
      ORDER BY e.razao_social, m.nome_conector`,
    [master, user.id]
  );
  const doUsuario = (r) => modulosDoUsuario({ permissao: user.permissao, telas_permitidas: user.telas }, r.modulos);
  return rows
    .filter((r) => master || (user.empresaIds?.has(r.empresa_id) && (r.escopo !== 'HORIZON' || doUsuario(r).length > 0)))
    .map((r) => ({
      id: r.id,
      nome_conector: r.nome_conector,
      escopo: r.escopo,
      modulos: r.escopo === 'HORIZON' ? doUsuario(r) : [],
      sessao_horas: r.sessao_horas,
      empresa_id: r.empresa_id,
      empresa: r.empresa,
      empresa_logo: r.empresa_logo,
      url: getUrlCompleta(r),
    }));
}

async function create({ empresa_id, nome_conector, escopo = 'COBRANCA', modulos = [], sessao_horas = 24, usuario_ids = [] }) {
  const token = gerarToken();
  const client = await pool.connect();
  let id;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO integracoes_mcp (empresa_id, nome_conector, token_hash, token_enc, escopo, modulos, sessao_horas)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [empresa_id, nome_conector, hashToken(token), encrypt(token), escopo, escopo === 'HORIZON' ? normalizarModulos(modulos) : [], sessao_horas]
    );
    id = rows[0].id;
    await definirUsuarios(id, empresa_id, usuario_ids, client);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return getById(id);
}

async function update(id, { nome_conector, sessao_horas, modulos, usuario_ids }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE integracoes_mcp SET nome_conector = $1, sessao_horas = COALESCE($3, sessao_horas),
              modulos = CASE WHEN escopo = 'HORIZON' THEN COALESCE($4, modulos) ELSE modulos END
        WHERE id = $2 RETURNING id, empresa_id`,
      [nome_conector, id, sessao_horas ?? null, modulos ? normalizarModulos(modulos) : null]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await definirUsuarios(id, rows[0].empresa_id, usuario_ids, client);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return getById(id);
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
  // Só conectores de cobrança: o do DFC tem rota própria, com login (dfc/mcpDfc.routes.js).
  const { rows } = await pool.query("SELECT empresa_id, ativo FROM integracoes_mcp WHERE token_hash = $1 AND escopo = 'COBRANCA'", [hash]);
  const row = rows[0];
  if (!row || !row.ativo) return null;

  // Fire-and-forget: telemetria de uso nunca pode atrasar/derrubar a
  // resposta de uma pergunta legítima da diretoria.
  pool.query('UPDATE integracoes_mcp SET ultimo_uso_em = NOW() WHERE token_hash = $1', [hash]).catch(() => {});

  return row.empresa_id;
}

module.exports = { list, getById, create, update, setAtivo, regenerarToken, resolverEmpresaPorToken, usuariosDaEmpresa, minhasConexoes };
