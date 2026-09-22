const pool = require('../../config/db');
const { encrypt, decrypt } = require('../../utils/crypto');

async function list({ page = 1, limit = 10, search = '', ativo, empresaIds }) {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;
  const conditions = ['(e.razao_social ILIKE $1 OR v.nome_conexao ILIKE $1)'];
  const params = [searchTerm];

  if (ativo !== undefined) {
    params.push(ativo);
    conditions.push(`v.ativo = $${params.length}`);
  }
  if (Array.isArray(empresaIds)) {
    params.push(empresaIds);
    conditions.push(`v.empresa_id = ANY($${params.length}::int[])`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // apelidos via subconsulta correlacionada (array_agg) — evita duplicar 1 linha por
  // convênio na listagem (que teria N linhas repetidas pra uma conexão com N apelidos).
  const { rows } = await pool.query(
    `SELECT v.id, v.nome_conexao, v.ativo, v.criado_em, v.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social,
            e.cnpj AS empresa_cnpj,
            COALESCE(
              (SELECT array_agg(c.apelido ORDER BY c.apelido) FROM integracoes_vanpix_convenios c WHERE c.integracao_id = v.id),
              '{}'
            ) AS apelidos
     FROM integracoes_vanpix v
     JOIN empresas e ON e.id = v.empresa_id
     ${whereClause}
     ORDER BY v.criado_em DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM integracoes_vanpix v JOIN empresas e ON e.id = v.empresa_id ${whereClause}`,
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
    `SELECT v.id, v.nome_conexao, v.ativo, v.criado_em, v.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social,
            e.cnpj AS empresa_cnpj
     FROM integracoes_vanpix v
     JOIN empresas e ON e.id = v.empresa_id
     WHERE v.id = $1`,
    [id]
  );
  const item = rows[0];
  if (!item) return null;
  const { rows: convenios } = await pool.query(
    'SELECT apelido FROM integracoes_vanpix_convenios WHERE integracao_id = $1 ORDER BY apelido',
    [id]
  );
  return { ...item, apelidos: convenios.map((c) => c.apelido) };
}

// Substitui a lista inteira de convênios de uma conexão (apaga tudo e insere de novo) — mais
// simples que tentar "diferenciar" quais apelidos entraram/saíram, e o volume por conexão é
// pequeno (dezenas, não milhares) — sem custo real em trocar tudo a cada salvamento.
async function substituirConvenios(client, integracaoId, apelidos) {
  await client.query('DELETE FROM integracoes_vanpix_convenios WHERE integracao_id = $1', [integracaoId]);
  if (apelidos.length === 0) return;
  const values = apelidos.map((_, i) => `($1, $${i + 2})`).join(', ');
  await client.query(
    `INSERT INTO integracoes_vanpix_convenios (integracao_id, apelido) VALUES ${values}`,
    [integracaoId, ...apelidos]
  );
}

async function create({ empresa_id, nome_conexao, service_key, client_secret, apelidos }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO integracoes_vanpix (empresa_id, nome_conexao, service_key_enc, client_secret_enc)
       VALUES ($1, $2, $3, $4)
       RETURNING id, empresa_id, nome_conexao, ativo, criado_em, atualizado_em`,
      [empresa_id, nome_conexao, encrypt(service_key), encrypt(client_secret)]
    );
    const item = rows[0];
    await substituirConvenios(client, item.id, apelidos);
    await client.query('COMMIT');
    return { ...item, apelidos };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// `service_key`/`client_secret` só entram no UPDATE quando informados de novo — mesmo
// espírito de sienge.service.js::update com `password` (editar sem preencher de novo mantém
// o segredo já salvo).
async function update(id, { empresa_id, nome_conexao, service_key, client_secret, apelidos }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const campos = ['empresa_id = $1', 'nome_conexao = $2', 'atualizado_em = NOW()'];
    const params = [empresa_id, nome_conexao];

    if (service_key) {
      params.push(encrypt(service_key));
      campos.push(`service_key_enc = $${params.length}`);
    }
    if (client_secret) {
      params.push(encrypt(client_secret));
      campos.push(`client_secret_enc = $${params.length}`);
    }

    params.push(id);
    const { rows } = await client.query(
      `UPDATE integracoes_vanpix SET ${campos.join(', ')} WHERE id = $${params.length}
       RETURNING id, empresa_id, nome_conexao, ativo, criado_em, atualizado_em`,
      params
    );
    const item = rows[0];
    if (!item) {
      await client.query('ROLLBACK');
      return null;
    }
    await substituirConvenios(client, id, apelidos);
    await client.query('COMMIT');
    return { ...item, apelidos };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function setAtivo(id, ativo) {
  const { rows } = await pool.query(
    `UPDATE integracoes_vanpix SET ativo = $1 WHERE id = $2
     RETURNING id, empresa_id, nome_conexao, ativo, criado_em, atualizado_em`,
    [ativo, id]
  );
  return rows[0] || null;
}

// Só pra uso interno de uma futura busca de retornos — nunca exposto pela API pro frontend
// (que só vê os campos de listagem/edição via getById, sem os segredos). Descriptografa na
// hora, não guarda em memória além do escopo desta chamada. Ainda sem nenhum consumidor
// nesta rodada (só o cadastro foi implementado) — deixado pronto pra quando a busca de
// verdade na API da VanPix for construída.
async function getCredenciais(id) {
  const { rows } = await pool.query(
    'SELECT service_key_enc, client_secret_enc, ativo FROM integracoes_vanpix WHERE id = $1',
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  const { rows: convenios } = await pool.query(
    'SELECT apelido FROM integracoes_vanpix_convenios WHERE integracao_id = $1 ORDER BY apelido',
    [id]
  );
  return {
    serviceKey: decrypt(row.service_key_enc),
    clientSecret: decrypt(row.client_secret_enc),
    ativo: row.ativo,
    apelidos: convenios.map((c) => c.apelido),
  };
}

module.exports = { list, getById, create, update, setAtivo, getCredenciais };
