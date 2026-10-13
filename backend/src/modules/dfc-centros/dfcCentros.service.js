const pool = require('../../config/db');

const COLUNAS = `sienge_id, name, apelido, status, natureza, projeta_dfc, codigo_contrato_caixa, codigo_prevision`;

// Todos os centros de custo da empresa (ativos e inativos), na mesma ordem da listagem de
// Cadastros > Centros de Custos (centros.service.js::listItens).
async function list(empresaId) {
  const { rows } = await pool.query(
    `SELECT ${COLUNAS} FROM centros_custo_sienge WHERE empresa_id = $1 ORDER BY sienge_id::text ASC`,
    [empresaId]
  );
  return rows;
}

// Contratos de empreendimento importados no Portal das Construtoras (arquivo "extrato" — a aba
// Unidades traz o contrato do empreendimento; ver extrato.service.js), com o nome do
// empreendimento, pra combobox "Contrato Caixa".
async function listContratosCaixa(empresaId) {
  const { rows } = await pool.query(
    `SELECT contrato_empreendimento AS contrato, MAX(nome_empreendimento) AS nome
       FROM extrato_empreendimentos
      WHERE empresa_id = $1
      GROUP BY contrato_empreendimento
      ORDER BY contrato_empreendimento ASC`,
    [empresaId]
  );
  return rows;
}

async function update(
  empresaId,
  siengeId,
  { natureza, projeta_dfc: projetaDfc, codigo_contrato_caixa: contrato, codigo_prevision: prevision }
) {
  const { rows } = await pool.query(
    `UPDATE centros_custo_sienge
        SET natureza = $3, projeta_dfc = $4, codigo_contrato_caixa = $5, codigo_prevision = $6
      WHERE empresa_id = $1 AND sienge_id = $2
      RETURNING ${COLUNAS}`,
    [empresaId, siengeId, natureza, projetaDfc, contrato, prevision]
  );
  return rows[0] || null;
}

module.exports = { list, listContratosCaixa, update };
