const pool = require('../../config/db');

// Operações > DRE Gerencial > Centros Custos: mesma lista da aba Centros Custos da DFC
// (dfc-centros/dfcCentros.service.js), só com a flag "Realiza DRE" (realiza_dre). O update só toca
// nela — Tipo, Contrato Caixa, Código Prevision e Projeta DFC são da DFC / do cadastro. A ordem é a
// do usuário (reordenar, arrastando na aba — database/migrations/2026-10-30-dre-centros-ordem.sql) e
// vale também pras colunas dos centros na aba DRE e pros filtros de centro da DRE Gerencial.

const COLUNAS = `sienge_id, name, apelido, status, natureza, realiza_dre`;

// Ordem da DRE: a do usuário (dre_ordem); os nunca ordenados depois, pelo ID em ordem numérica (1, 2,
// 3… 10 — pedido do usuário; a aba da DFC ordena como texto: 1, 10, 11… 2).
const ORDEM = 'dre_ordem ASC NULLS LAST, sienge_id ASC';

// Todos os centros de custo da empresa (ativos e inativos), na ordem da DRE.
async function list(empresaId) {
  const { rows } = await pool.query(`SELECT ${COLUNAS} FROM centros_custo_sienge WHERE empresa_id = $1 ORDER BY ${ORDEM}`, [
    empresaId,
  ]);
  return rows;
}

// `ordem`: os sienge_id na nova ordem (a lista inteira da aba). Centro da empresa que não vier na lista
// vai pro fim (null). Devolve a lista já reordenada.
async function reordenar(empresaId, ordem) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT sienge_id FROM centros_custo_sienge WHERE empresa_id = $1', [empresaId]);
    const existentes = new Set(rows.map((r) => Number(r.sienge_id)));
    const lista = [...new Set(ordem.map(Number))];
    if (lista.some((id) => !existentes.has(id))) {
      const e = new Error('Centro de custo não encontrado nesta empresa.');
      e.status = 400;
      e.expose = true;
      throw e;
    }
    await client.query('UPDATE centros_custo_sienge SET dre_ordem = NULL WHERE empresa_id = $1 AND NOT (sienge_id = ANY($2::int[]))', [
      empresaId,
      lista,
    ]);
    await client.query(
      `UPDATE centros_custo_sienge c SET dre_ordem = o.posicao - 1
         FROM unnest($2::int[]) WITH ORDINALITY AS o(sienge_id, posicao)
        WHERE c.empresa_id = $1 AND c.sienge_id = o.sienge_id`,
      [empresaId, lista]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return list(empresaId);
}

async function update(empresaId, siengeId, realizaDre) {
  const { rows } = await pool.query(
    `UPDATE centros_custo_sienge SET realiza_dre = $3
      WHERE empresa_id = $1 AND sienge_id = $2
      RETURNING ${COLUNAS}`,
    [empresaId, siengeId, realizaDre]
  );
  return rows[0] || null;
}

module.exports = { list, update, reordenar, ORDEM };
