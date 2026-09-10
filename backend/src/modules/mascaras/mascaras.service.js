const pool = require('../../config/db');

async function list(tipo, empresaId, grupo = '') {
  const { rows } = await pool.query(
    'SELECT id, empresa_id, tipo, grupo, sequencia, descricao, criado_em, atualizado_em FROM mascara_itens WHERE tipo = $1 AND empresa_id = $2 AND grupo = $3 ORDER BY sequencia ASC',
    [tipo, empresaId, grupo]
  );
  return rows;
}

async function create(tipo, empresaId, grupo = '') {
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(sequencia), 0) + 1 AS next_seq FROM mascara_itens WHERE tipo = $1 AND empresa_id = $2 AND grupo = $3',
    [tipo, empresaId, grupo]
  );
  const nextSeq = maxRows[0].next_seq;

  const { rows } = await pool.query(
    `INSERT INTO mascara_itens (tipo, empresa_id, grupo, sequencia, descricao)
     VALUES ($1, $2, $3, $4, '')
     RETURNING id, empresa_id, tipo, grupo, sequencia, descricao, criado_em, atualizado_em`,
    [tipo, empresaId, grupo, nextSeq]
  );
  return rows[0];
}

async function updateDescricao(id, descricao) {
  const { rows } = await pool.query(
    `UPDATE mascara_itens SET descricao = $1 WHERE id = $2
     RETURNING id, empresa_id, tipo, grupo, sequencia, descricao, criado_em, atualizado_em`,
    [descricao, id]
  );
  return rows[0] || null;
}

async function remove(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT tipo, empresa_id, grupo FROM mascara_itens WHERE id = $1',
      [id]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return false;
    }
    const { tipo, empresa_id: empresaId, grupo } = rows[0];

    await client.query('DELETE FROM mascara_itens WHERE id = $1', [id]);

    // Renumera as linhas restantes (dentro do mesmo tipo + empresa + grupo)
    // para não deixar buracos na sequência, usando valores negativos
    // temporários para não colidir com a UNIQUE (tipo, empresa_id, grupo, sequencia).
    await client.query(
      'UPDATE mascara_itens SET sequencia = -sequencia WHERE tipo = $1 AND empresa_id = $2 AND grupo = $3',
      [tipo, empresaId, grupo]
    );
    await client.query(
      `UPDATE mascara_itens m SET sequencia = o.nova_seq
       FROM (
         SELECT id, ROW_NUMBER() OVER (ORDER BY ABS(sequencia) ASC) AS nova_seq
         FROM mascara_itens WHERE tipo = $1 AND empresa_id = $2 AND grupo = $3
       ) o
       WHERE m.id = o.id`,
      [tipo, empresaId, grupo]
    );

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { list, create, updateDescricao, remove };
