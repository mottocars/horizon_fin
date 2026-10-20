const pool = require('../../config/db');
const etapasService = require('../etapas-centro-custo/etapasCentroCusto.service');

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Datas do cronograma de um centro (ou de todos, sem siengeId): Map sienge_id -> { etapa_id: data }.
async function datasPorCentro(empresaId, siengeId = null, db = pool) {
  const { rows } = await db.query(
    `SELECT sienge_id, etapa_id, data FROM cronograma_centro_etapas
      WHERE empresa_id = $1 AND ($2::int IS NULL OR sienge_id = $2)`,
    [empresaId, siengeId]
  );
  const porCentro = new Map();
  rows.forEach((r) => {
    if (!porCentro.has(r.sienge_id)) porCentro.set(r.sienge_id, {});
    porCentro.get(r.sienge_id)[r.etapa_id] = r.data;
  });
  return porCentro;
}

// As etapas da empresa (máscara Etapas do Centro de Custo, na ordem) e todos os centros de custo
// dela — mesma lista e ordem da aba Centros Custos da DFC (dfcCentros.service.js) —, cada um com o
// Tipo e o cronograma.
async function list(empresaId) {
  const etapas = await etapasService.list(empresaId);
  const { rows: centros } = await pool.query(
    `SELECT c.sienge_id, c.name, c.apelido, c.status, c.natureza, t.data_termino
       FROM centros_custo_sienge c
       LEFT JOIN cronograma_centros t ON t.empresa_id = c.empresa_id AND t.sienge_id = c.sienge_id
      WHERE c.empresa_id = $1
      ORDER BY c.sienge_id::text ASC`,
    [empresaId]
  );
  const datas = await datasPorCentro(empresaId);
  return { etapas, centros: centros.map((c) => ({ ...c, datas: datas.get(c.sienge_id) || {} })) };
}

// Tipo do centro — a MESMA coluna da aba Centros Custos da DFC e do cadastro do centro de custo:
// mudar aqui muda lá. Só o Tipo (o resto da classificação da DFC não é desta tela).
async function updateNatureza(empresaId, siengeId, natureza) {
  const { rows } = await pool.query(
    `UPDATE centros_custo_sienge SET natureza = $3
      WHERE empresa_id = $1 AND sienge_id = $2
      RETURNING sienge_id, natureza`,
    [empresaId, siengeId, natureza]
  );
  return rows[0] || null;
}

// Grava as datas que mudaram (data null apaga) e, se veio, o término. Devolve o cronograma do
// centro como ficou.
async function updateDatas(empresaId, siengeId, { datas, dataTermino }, usuarioId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: centro } = await client.query(
      'SELECT 1 FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2',
      [empresaId, siengeId]
    );
    if (!centro[0]) throw erro(404, 'Centro de custo não encontrado.');

    const etapaIds = [...new Set(datas.map((d) => d.etapa_id))];
    if (etapaIds.length) {
      const { rows } = await client.query(
        'SELECT id FROM mascara_itens WHERE tipo = $1 AND empresa_id = $2 AND id = ANY($3::int[])',
        [etapasService.TIPO, empresaId, etapaIds]
      );
      if (rows.length !== etapaIds.length) {
        throw erro(409, 'As etapas foram alteradas em outro lugar. Recarregue a tela e tente de novo.');
      }
    }

    for (const { etapa_id: etapaId, data } of datas) {
      if (data === null) {
        await client.query(
          'DELETE FROM cronograma_centro_etapas WHERE empresa_id = $1 AND sienge_id = $2 AND etapa_id = $3',
          [empresaId, siengeId, etapaId]
        );
      } else {
        await client.query(
          `INSERT INTO cronograma_centro_etapas (empresa_id, sienge_id, etapa_id, data, usuario_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (empresa_id, sienge_id, etapa_id)
           DO UPDATE SET data = EXCLUDED.data, usuario_id = EXCLUDED.usuario_id, atualizado_em = NOW()`,
          [empresaId, siengeId, etapaId, data, usuarioId]
        );
      }
    }

    if (dataTermino === null) {
      await client.query('DELETE FROM cronograma_centros WHERE empresa_id = $1 AND sienge_id = $2', [empresaId, siengeId]);
    } else if (dataTermino !== undefined) {
      await client.query(
        `INSERT INTO cronograma_centros (empresa_id, sienge_id, data_termino, usuario_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (empresa_id, sienge_id)
         DO UPDATE SET data_termino = EXCLUDED.data_termino, usuario_id = EXCLUDED.usuario_id, atualizado_em = NOW()`,
        [empresaId, siengeId, dataTermino, usuarioId]
      );
    }

    const porCentro = await datasPorCentro(empresaId, siengeId, client);
    const { rows: termino } = await client.query(
      'SELECT data_termino FROM cronograma_centros WHERE empresa_id = $1 AND sienge_id = $2',
      [empresaId, siengeId]
    );
    await client.query('COMMIT');
    return { sienge_id: siengeId, datas: porCentro.get(siengeId) || {}, data_termino: termino[0]?.data_termino ?? null };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { list, updateNatureza, updateDatas };
