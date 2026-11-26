const pool = require('../../config/db');

async function list(tipo, empresaId, grupo = '') {
  const { rows } = await pool.query(
    'SELECT id, empresa_id, tipo, grupo, sequencia, descricao, sla_dias, responsavel_id, criado_em, atualizado_em FROM mascara_itens WHERE tipo = $1 AND empresa_id = $2 AND grupo = $3 ORDER BY sequencia ASC',
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
     RETURNING id, empresa_id, tipo, grupo, sequencia, descricao, sla_dias, responsavel_id, criado_em, atualizado_em`,
    [tipo, empresaId, grupo, nextSeq]
  );
  return rows[0];
}

// `slaDias` só faz sentido pra tipo='REPASSES' (micro etapa) — nos demais
// tipos o front nem manda o campo, fica sempre NULL. Atualiza os dois campos
// juntos (não só o que mudou) porque a linha inteira já vem do estado local
// do componente — ver MascaraItensEditor.jsx. O responsável (Pacotes e Pilares)
// só muda com `mudaResponsavel` (ver o controller).
async function update(id, { descricao, slaDias, mudaResponsavel = false, responsavelId = null }) {
  const { rows } = await pool.query(
    `UPDATE mascara_itens
        SET descricao = $1, sla_dias = $2,
            responsavel_id = CASE WHEN $4 THEN $5::int ELSE responsavel_id END
      WHERE id = $3
     RETURNING id, empresa_id, tipo, grupo, sequencia, descricao, sla_dias, responsavel_id, criado_em, atualizado_em`,
    [descricao, slaDias, id, mudaResponsavel, responsavelId]
  );
  return rows[0] || null;
}

async function get(id) {
  const { rows } = await pool.query('SELECT id, empresa_id, tipo, responsavel_id FROM mascara_itens WHERE id = $1', [id]);
  return rows[0] || null;
}

// Usuário ativo com a empresa no cadastro (usuarios_empresas) — Master não entra (não tem empresa vinculada),
// igual ao Responsável das contas do plano financeiro (planos.service.js::listResponsaveis).
async function listResponsaveis(empresaId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nome
       FROM usuarios u
       JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = $1
      WHERE u.ativo = TRUE
      ORDER BY u.nome ASC`,
    [empresaId]
  );
  return rows;
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

// Pacotes e Pilares (editor no desenho das Etapas do Centro de Custo — pages/Mascaras/PacotesPilaresEditor.jsx):
// cria várias de uma vez no fim da lista (colar várias linhas), na ordem em que vieram.
async function createVarios(tipo, empresaId, descricoes) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: maxRows } = await client.query(
      `SELECT COALESCE(MAX(sequencia), 0) AS max FROM mascara_itens WHERE tipo = $1 AND empresa_id = $2 AND grupo = ''`,
      [tipo, empresaId]
    );
    const { rows } = await client.query(
      `INSERT INTO mascara_itens (tipo, empresa_id, grupo, sequencia, descricao)
       SELECT $1, $2, '', $3 + d.n, d.descricao FROM UNNEST($4::text[]) WITH ORDINALITY AS d(descricao, n)
       RETURNING id, empresa_id, tipo, grupo, sequencia, descricao, sla_dias, responsavel_id, criado_em, atualizado_em`,
      [tipo, empresaId, maxRows[0].max, descricoes]
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

// Regrava a ordem da lista inteira (arrastar e soltar). Exige exatamente os itens da empresa — se alguém
// criou/apagou algo noutra aba nesse meio-tempo, recusa em vez de adivinhar (o front recarrega). Passa por
// valores negativos pra não bater na UNIQUE (tipo, empresa_id, grupo, sequencia).
async function reordenar(tipo, empresaId, ids) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: atuais } = await client.query(
      `SELECT id FROM mascara_itens WHERE tipo = $1 AND empresa_id = $2 AND grupo = '' FOR UPDATE`,
      [tipo, empresaId]
    );
    const atuaisIds = new Set(atuais.map((r) => r.id));
    if (new Set(ids).size !== ids.length || atuaisIds.size !== ids.length || ids.some((id) => !atuaisIds.has(id))) {
      const err = new Error('A lista foi alterada em outro lugar. Recarregue a tela e tente de novo.');
      err.status = 409;
      err.expose = true;
      throw err;
    }
    await client.query(`UPDATE mascara_itens SET sequencia = -sequencia WHERE tipo = $1 AND empresa_id = $2 AND grupo = ''`, [
      tipo,
      empresaId,
    ]);
    await client.query(
      `UPDATE mascara_itens m SET sequencia = v.ordem
         FROM UNNEST($3::int[]) WITH ORDINALITY AS v(id, ordem)
        WHERE m.id = v.id AND m.tipo = $1 AND m.empresa_id = $2`,
      [tipo, empresaId, ids]
    );
    await client.query('COMMIT');
    return list(tipo, empresaId, '');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { list, get, create, createVarios, reordenar, update, remove, listResponsaveis };
