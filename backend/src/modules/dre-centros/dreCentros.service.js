const pool = require('../../config/db');

// Operações > DRE Gerencial > Centros Custos: mesma aba de dfc-centros/dfcCentros.service.js, com a
// flag "Realiza DRE" (realiza_dre) no lugar do "Projeta DFC". Tipo, Contrato Caixa e Código
// Prevision são as MESMAS colunas do cadastro do centro (e da aba da DFC) — gravar aqui muda lá.
// O update não toca no projeta_dfc (é da DFC).

const COLUNAS = `sienge_id, name, apelido, status, natureza, realiza_dre, codigo_contrato_caixa, codigo_prevision`;

// Todos os centros de custo da empresa (ativos e inativos), na mesma ordem da aba da DFC.
async function list(empresaId) {
  const { rows } = await pool.query(
    `SELECT ${COLUNAS} FROM centros_custo_sienge WHERE empresa_id = $1 ORDER BY sienge_id::text ASC`,
    [empresaId]
  );
  return rows;
}

async function update(
  empresaId,
  siengeId,
  { natureza, realiza_dre: realizaDre, codigo_contrato_caixa: contrato, codigo_prevision: prevision }
) {
  const { rows } = await pool.query(
    `UPDATE centros_custo_sienge
        SET natureza = $3, realiza_dre = $4, codigo_contrato_caixa = $5, codigo_prevision = $6
      WHERE empresa_id = $1 AND sienge_id = $2
      RETURNING ${COLUNAS}`,
    [empresaId, siengeId, natureza, realizaDre, contrato, prevision]
  );
  return rows[0] || null;
}

module.exports = { list, update };
