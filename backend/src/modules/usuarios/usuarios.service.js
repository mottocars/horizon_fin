const bcrypt = require('bcryptjs');
const pool = require('../../config/db');

const SALT_ROUNDS = 10;

// array_agg com FILTER pra não virar [null] quando o usuário não tem
// nenhuma empresa vinculada (ex.: Master) — vira '{}' mesmo.
const SELECT_BASE = `
  SELECT u.id, u.nome, u.email, u.username, u.telefone_ddd, u.telefone_numero, u.avatar_url,
         u.permissao, u.telas_permitidas, u.ativo, u.primeiro_acesso, u.criado_em, u.atualizado_em,
         COALESCE(
           array_agg(ue.empresa_id ORDER BY e.razao_social) FILTER (WHERE ue.empresa_id IS NOT NULL),
           '{}'
         ) AS empresa_ids,
         COALESCE(
           array_agg(COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) ORDER BY e.razao_social)
             FILTER (WHERE ue.empresa_id IS NOT NULL),
           '{}'
         ) AS empresa_nomes
  FROM usuarios u
  LEFT JOIN usuarios_empresas ue ON ue.usuario_id = u.id
  LEFT JOIN empresas e ON e.id = ue.empresa_id
`;
const GROUP_BY = 'GROUP BY u.id';

async function list({ page = 1, limit = 10, search = '', ativo, empresaIds, excludeMaster }) {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;
  const conditions = ['(u.nome ILIKE $1 OR u.email ILIKE $1 OR u.username ILIKE $1)'];
  const params = [searchTerm];

  if (ativo !== undefined) {
    params.push(ativo);
    conditions.push(`u.ativo = $${params.length}`);
  }

  // Usuário Master nunca aparece pra quem não é Master — nem na listagem.
  if (excludeMaster) {
    conditions.push(`u.permissao <> 'MASTER'`);
  }

  if (Array.isArray(empresaIds)) {
    // Só entram usuários que tenham ao menos uma empresa em comum com o
    // solicitante.
    params.push(empresaIds);
    conditions.push(
      `EXISTS (SELECT 1 FROM usuarios_empresas ue2 WHERE ue2.usuario_id = u.id AND ue2.empresa_id = ANY($${params.length}::int[]))`
    );
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `${SELECT_BASE}
     ${whereClause}
     ${GROUP_BY}
     ORDER BY u.nome ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM usuarios u ${whereClause}`,
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
  const { rows } = await pool.query(`${SELECT_BASE} WHERE u.id = $1 ${GROUP_BY}`, [id]);
  return rows[0] || null;
}

async function vincularEmpresas(client, usuarioId, empresaIds, permissao) {
  await client.query('DELETE FROM usuarios_empresas WHERE usuario_id = $1', [usuarioId]);
  // Master não tem vínculo de empresa — acesso é total, sem lista.
  const ids = permissao === 'MASTER' ? [] : empresaIds || [];
  if (ids.length === 0) return;
  const values = ids.map((_, i) => `($1, $${i + 2})`).join(', ');
  await client.query(
    `INSERT INTO usuarios_empresas (usuario_id, empresa_id) VALUES ${values} ON CONFLICT DO NOTHING`,
    [usuarioId, ...ids]
  );
}

async function create(data) {
  const senhaHash = await bcrypt.hash(data.senha, SALT_ROUNDS);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO usuarios
        (nome, email, username, senha_hash, telefone_ddd, telefone_numero, permissao, telas_permitidas, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        data.nome,
        data.email,
        data.username,
        senhaHash,
        data.telefone_ddd || null,
        data.telefone_numero || null,
        data.permissao,
        data.permissao === 'BASICO' ? data.telas_permitidas : [],
        data.avatar_url || null,
      ]
    );
    const id = rows[0].id;
    await vincularEmpresas(client, id, data.empresa_ids, data.permissao);
    await client.query('COMMIT');
    return getById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function update(id, data) {
  const campos = [
    'nome = $1',
    'email = $2',
    'username = $3',
    'telefone_ddd = $4',
    'telefone_numero = $5',
    'permissao = $6',
    'telas_permitidas = $7',
  ];
  const params = [
    data.nome,
    data.email,
    data.username,
    data.telefone_ddd || null,
    data.telefone_numero || null,
    data.permissao,
    data.permissao === 'BASICO' ? data.telas_permitidas : [],
  ];

  if (data.senha) {
    const senhaHash = await bcrypt.hash(data.senha, SALT_ROUNDS);
    params.push(senhaHash);
    campos.push(`senha_hash = $${params.length}`);
  }

  // undefined = usuário não mexeu na foto (mantém a atual); '' ou uma nova
  // data URI = mudou de verdade (removeu ou trocou) — só nesse caso grava.
  if (data.avatar_url !== undefined) {
    params.push(data.avatar_url || null);
    campos.push(`avatar_url = $${params.length}`);
  }

  params.push(id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `UPDATE usuarios SET ${campos.join(', ')} WHERE id = $${params.length}`,
      params
    );
    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    await vincularEmpresas(client, id, data.empresa_ids, data.permissao);
    await client.query('COMMIT');
    return getById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function setAtivo(id, ativo) {
  const { rowCount } = await pool.query('UPDATE usuarios SET ativo = $1 WHERE id = $2', [ativo, id]);
  if (rowCount === 0) return null;
  return getById(id);
}

// Autoatendimento: o próprio usuário editando "Meu perfil". Diferente de
// update() (usado pelo cadastro de usuários), aqui não mexe em
// permissao/telas_permitidas/empresa_ids — ninguém pode se autopromover
// alterando o próprio perfil.
async function updateSelf(id, data) {
  const campos = [
    'nome = $1',
    'email = $2',
    'username = $3',
    'telefone_ddd = $4',
    'telefone_numero = $5',
  ];
  const params = [
    data.nome,
    data.email,
    data.username,
    data.telefone_ddd || null,
    data.telefone_numero || null,
  ];

  if (data.senha) {
    const senhaHash = await bcrypt.hash(data.senha, SALT_ROUNDS);
    params.push(senhaHash);
    campos.push(`senha_hash = $${params.length}`);
  }

  // undefined = não mexeu na foto (mantém a atual); '' ou nova data URI =
  // mudou de verdade — só nesse caso grava.
  if (data.avatar_url !== undefined) {
    params.push(data.avatar_url || null);
    campos.push(`avatar_url = $${params.length}`);
  }

  params.push(id);

  const { rowCount } = await pool.query(
    `UPDATE usuarios SET ${campos.join(', ')} WHERE id = $${params.length}`,
    params
  );
  if (rowCount === 0) return null;
  return getById(id);
}

// Tela obrigatória de primeiro acesso: confirma e-mail e celular (evita
// erro de digitação do que o admin cadastrou), exige foto e troca a senha
// inicial. Ao final, primeiro_acesso vira FALSE e o usuário nunca mais cai
// aqui — diferente de updateSelf(), sempre mexe nesses campos (não é
// opcional) e nunca em permissao/telas_permitidas/empresa_ids.
async function completarPrimeiroAcesso(id, data) {
  const senhaHash = await bcrypt.hash(data.senha, SALT_ROUNDS);
  const { rowCount } = await pool.query(
    `UPDATE usuarios
     SET email = $1, telefone_ddd = $2, telefone_numero = $3, senha_hash = $4,
         avatar_url = $5, primeiro_acesso = FALSE
     WHERE id = $6`,
    [data.email, data.telefone_ddd, data.telefone_numero, senhaHash, data.avatar_url, id]
  );
  if (rowCount === 0) return null;
  return getById(id);
}

module.exports = { list, getById, create, update, setAtivo, updateSelf, completarPrimeiroAcesso };