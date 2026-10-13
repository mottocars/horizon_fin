const pool = require('../../config/db');

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Máscara DFC e Origem da Projeção já escolhidas nas contas da empresa (só as que têm algo).
async function list(empresaId) {
  const { rows } = await pool.query(
    `SELECT sienge_id, mascara_id, origem_projecao FROM dfc_plano_contas WHERE empresa_id = $1`,
    [empresaId]
  );
  return rows;
}

// Grava (ou limpa) os dois campos de uma conta. Só conta analítica (o último nível — tp_conta
// diferente de 'T') e só máscara de nível 2 da mesma empresa. Os dois vazios = apaga a linha.
async function update(empresaId, siengeId, { mascara_id: mascaraId, origem_projecao: origem }) {
  const { rows: conta } = await pool.query(
    'SELECT tp_conta FROM planos_financeiros_sienge WHERE empresa_id = $1 AND sienge_id = $2',
    [empresaId, siengeId]
  );
  if (!conta[0]) throw erro(404, 'Conta não encontrada no plano de contas desta empresa.');
  if (conta[0].tp_conta === 'T') throw erro(400, 'Conta totalizadora não recebe Máscara DFC nem Origem da Projeção.');

  if (mascaraId !== null) {
    const { rows: mascara } = await pool.query(
      'SELECT parent_id FROM dfc_mascaras WHERE id = $1 AND empresa_id = $2',
      [mascaraId, empresaId]
    );
    if (!mascara[0]) throw erro(400, 'Máscara DFC não encontrada nesta empresa.');
    if (mascara[0].parent_id === null) throw erro(400, 'Escolha uma máscara DFC de nível 2.');
  }

  if (mascaraId === null && origem === null) {
    await pool.query('DELETE FROM dfc_plano_contas WHERE empresa_id = $1 AND sienge_id = $2', [empresaId, siengeId]);
    return { sienge_id: siengeId, mascara_id: null, origem_projecao: null };
  }

  const { rows } = await pool.query(
    `INSERT INTO dfc_plano_contas (empresa_id, sienge_id, mascara_id, origem_projecao)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (empresa_id, sienge_id)
     DO UPDATE SET mascara_id = EXCLUDED.mascara_id, origem_projecao = EXCLUDED.origem_projecao
     RETURNING sienge_id, mascara_id, origem_projecao`,
    [empresaId, siengeId, mascaraId, origem]
  );
  return rows[0];
}

module.exports = { list, update };
