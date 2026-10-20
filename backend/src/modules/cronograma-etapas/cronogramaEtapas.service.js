const pool = require('../../config/db');

// Mesmo esquema de dfcMascaras.service.js, num nível só (sem parent_id).

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

async function list(empresaId, db = pool) {
  const { rows } = await db.query(
    `SELECT id, ordem, descricao, cor FROM cronograma_etapas
      WHERE empresa_id = $1
      ORDER BY ordem ASC, id ASC`,
    [empresaId]
  );
  return rows;
}

// Cria no fim da lista, na ordem em que as descrições vieram. `cores` pode ser mais curta (o
// UNNEST completa com NULL) — a que faltar fica com a cor padrão da coluna.
async function create(empresaId, descricoes, cores = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: maxRows } = await client.query(
      'SELECT COALESCE(MAX(ordem), 0) AS max FROM cronograma_etapas WHERE empresa_id = $1',
      [empresaId]
    );
    const { rows } = await client.query(
      `INSERT INTO cronograma_etapas (empresa_id, ordem, descricao, cor)
       SELECT $1, $2 + d.n, d.descricao, COALESCE(d.cor, '#3b82f6')
         FROM UNNEST($3::text[], $4::text[]) WITH ORDINALITY AS d(descricao, cor, n)
       RETURNING id, ordem, descricao, cor`,
      [empresaId, maxRows[0].max, descricoes, cores]
    );
    await client.query('COMMIT');
    return rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Nome e/ou cor — o que não vier fica como está.
async function update(id, empresaId, { descricao, cor }) {
  const { rows } = await pool.query(
    `UPDATE cronograma_etapas SET descricao = COALESCE($3, descricao), cor = COALESCE($4, cor)
      WHERE id = $1 AND empresa_id = $2
     RETURNING id, ordem, descricao, cor`,
    [id, empresaId, descricao ?? null, cor ?? null]
  );
  return rows[0] || null;
}

async function remove(id, empresaId) {
  const { rows } = await pool.query('DELETE FROM cronograma_etapas WHERE id = $1 AND empresa_id = $2 RETURNING id', [
    id,
    empresaId,
  ]);
  return !!rows[0];
}

// Regrava a ordem da lista inteira de uma vez, a partir da ordem final que o front montou depois
// do arrastar e soltar. Exige que a lista tenha exatamente as etapas da empresa — se alguém
// criou/apagou algo noutra aba nesse meio-tempo, recusa em vez de adivinhar (o front recarrega).
async function reordenar(empresaId, ids) {
  if (new Set(ids).size !== ids.length) throw erro(400, 'Lista inválida: etapa repetida.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: atuais } = await client.query('SELECT id FROM cronograma_etapas WHERE empresa_id = $1 FOR UPDATE', [
      empresaId,
    ]);
    const atuaisIds = new Set(atuais.map((r) => r.id));
    if (atuaisIds.size !== ids.length || ids.some((id) => !atuaisIds.has(id))) {
      throw erro(409, 'As etapas foram alteradas em outro lugar. Recarregue a tela e tente de novo.');
    }
    await client.query(
      `UPDATE cronograma_etapas e
          SET ordem = v.ordem
         FROM UNNEST($2::int[]) WITH ORDINALITY AS v(id, ordem)
        WHERE e.id = v.id AND e.empresa_id = $1`,
      [empresaId, ids]
    );
    const lista = await list(empresaId, client);
    await client.query('COMMIT');
    return lista;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { list, create, update, remove, reordenar };
