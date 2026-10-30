const pool = require('../../config/db');

// As etapas de obra de cada empresa são a máscara "Etapas do Centro de Custo" (mascara_itens,
// tipo ETAPAS_CENTRO_CUSTO, grupo '') — uma lista só (pedido do usuário), editada em Cadastros >
// Máscaras e usada pelo Histórico de Etapas dos centros de custo, que é o cronograma das obras. Mesmo esquema de dfcMascaras.service.js, num nível
// só. Cuidado: Cobrança, Curvas e Repasses procuram etapas pelo nome (Lançamento, Obras, Entrega).
// Cada etapa tem o "Tipo duração" (`tipo_duracao`: MESES | ANOS — pedido do usuário): a unidade em
// que a duração dela é digitada e mostrada no Histórico de Etapas, no Gantt e no Excel.

const TIPO = 'ETAPAS_CENTRO_CUSTO';

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

async function list(empresaId, db = pool) {
  const { rows } = await db.query(
    `SELECT id, sequencia, descricao, cor, tipo_duracao FROM mascara_itens
      WHERE tipo = $1 AND empresa_id = $2 AND grupo = ''
      ORDER BY sequencia ASC, id ASC`,
    [TIPO, empresaId]
  );
  return rows;
}

// Cria no fim da lista, na ordem em que as descrições vieram. `cores` pode ser mais curta (o
// UNNEST completa com NULL) — a que faltar fica com o azul da paleta.
async function create(empresaId, descricoes, cores = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: maxRows } = await client.query(
      `SELECT COALESCE(MAX(sequencia), 0) AS max FROM mascara_itens WHERE tipo = $1 AND empresa_id = $2 AND grupo = ''`,
      [TIPO, empresaId]
    );
    const { rows } = await client.query(
      `INSERT INTO mascara_itens (tipo, empresa_id, grupo, sequencia, descricao, cor, tipo_duracao)
       SELECT $1, $2, '', $3 + d.n, d.descricao, COALESCE(d.cor, '#3b82f6'), 'MESES'
         FROM UNNEST($4::text[], $5::text[]) WITH ORDINALITY AS d(descricao, cor, n)
       RETURNING id, sequencia, descricao, cor, tipo_duracao`,
      [TIPO, empresaId, maxRows[0].max, descricoes, cores]
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

// Nome, cor e/ou tipo duração — o que não vier fica como está.
async function update(id, empresaId, { descricao, cor, tipoDuracao }) {
  const { rows } = await pool.query(
    `UPDATE mascara_itens
        SET descricao = COALESCE($4, descricao), cor = COALESCE($5, cor), tipo_duracao = COALESCE($6, tipo_duracao)
      WHERE id = $1 AND empresa_id = $2 AND tipo = $3
     RETURNING id, sequencia, descricao, cor, tipo_duracao`,
    [id, empresaId, TIPO, descricao ?? null, cor ?? null, tipoDuracao ?? null]
  );
  return rows[0] || null;
}

// Etapa com datas no Histórico de Etapas de algum centro de custo (= o cronograma das obras) não
// sai — lá a chave é RESTRICT; avisa em vez de estourar o erro do banco. Depois renumera a
// sequência, sem buracos, como o remover genérico de mascaras.service.js.
async function remove(id, empresaId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: emUso } = await client.query(
      'SELECT COUNT(DISTINCT sienge_id)::int AS centros FROM centro_custo_etapas_historico WHERE mascara_item_id = $1',
      [id]
    );
    if (emUso[0].centros > 0) {
      throw erro(
        409,
        `Essa etapa tem datas no cronograma (Histórico de Etapas) de ${emUso[0].centros} centro(s) de custo. Apague as datas dela antes de remover.`
      );
    }
    const { rows } = await client.query(
      'DELETE FROM mascara_itens WHERE id = $1 AND empresa_id = $2 AND tipo = $3 RETURNING id',
      [id, empresaId, TIPO]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return false;
    }
    await renumerar(client, empresaId, null);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Regrava a sequência de todo mundo: na ordem de `ids` ou, sem ids, na ordem atual (fecha buracos).
// Passa antes por valores negativos pra não bater na UNIQUE (tipo, empresa_id, grupo, sequencia).
async function renumerar(client, empresaId, ids) {
  await client.query(
    `UPDATE mascara_itens SET sequencia = -sequencia WHERE tipo = $1 AND empresa_id = $2 AND grupo = ''`,
    [TIPO, empresaId]
  );
  if (ids) {
    await client.query(
      `UPDATE mascara_itens m SET sequencia = v.ordem
         FROM UNNEST($3::int[]) WITH ORDINALITY AS v(id, ordem)
        WHERE m.id = v.id AND m.tipo = $1 AND m.empresa_id = $2`,
      [TIPO, empresaId, ids]
    );
  } else {
    await client.query(
      `UPDATE mascara_itens m SET sequencia = o.nova
         FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY -sequencia ASC, id ASC) AS nova
                 FROM mascara_itens WHERE tipo = $1 AND empresa_id = $2 AND grupo = '') o
        WHERE m.id = o.id`,
      [TIPO, empresaId]
    );
  }
}

// Regrava a ordem da lista inteira de uma vez, a partir da ordem final que o front montou depois
// do arrastar e soltar. Exige que a lista tenha exatamente as etapas da empresa — se alguém
// criou/apagou algo noutra tela nesse meio-tempo, recusa em vez de adivinhar (o front recarrega).
async function reordenar(empresaId, ids) {
  if (new Set(ids).size !== ids.length) throw erro(400, 'Lista inválida: etapa repetida.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: atuais } = await client.query(
      `SELECT id FROM mascara_itens WHERE tipo = $1 AND empresa_id = $2 AND grupo = '' FOR UPDATE`,
      [TIPO, empresaId]
    );
    const atuaisIds = new Set(atuais.map((r) => r.id));
    if (atuaisIds.size !== ids.length || ids.some((id) => !atuaisIds.has(id))) {
      throw erro(409, 'As etapas foram alteradas em outro lugar. Recarregue a tela e tente de novo.');
    }
    await renumerar(client, empresaId, ids);
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

module.exports = { TIPO, list, create, update, remove, reordenar };
