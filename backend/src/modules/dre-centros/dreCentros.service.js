const pool = require('../../config/db');

// Operações > DRE Gerencial > Centros Custos: mesma lista da aba Centros Custos da DFC
// (dfc-centros/dfcCentros.service.js), só com a flag "Realiza DRE" (realiza_dre). O update só toca
// nela — Tipo, Contrato Caixa, Código Prevision e Projeta DFC são da DFC / do cadastro.

const COLUNAS = `sienge_id, name, apelido, status, natureza, realiza_dre`;

// Todos os centros de custo da empresa (ativos e inativos), pelo ID em ordem numérica (1, 2, 3…
// 10 — pedido do usuário; a aba da DFC ordena como texto: 1, 10, 11… 2).
async function list(empresaId) {
  const { rows } = await pool.query(
    `SELECT ${COLUNAS} FROM centros_custo_sienge WHERE empresa_id = $1 ORDER BY sienge_id ASC`,
    [empresaId]
  );
  return rows;
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

module.exports = { list, update };
