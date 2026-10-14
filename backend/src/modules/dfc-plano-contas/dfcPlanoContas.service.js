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
// Origem "CEF - ..." só pode estar em UMA conta da empresa (a Projeção CEF lança nela): se já
// estiver em outra, recusa com 409 (`codigo: 'ORIGEM_CEF_EM_USO'` e a conta atual) — a tela avisa
// e, confirmando, manda `transferir: true`, que tira a origem da outra conta na mesma transação.
async function update(empresaId, siengeId, { mascara_id: mascaraId, origem_projecao: origem }, { transferir = false } = {}) {
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let liberada = null; // conta de onde a origem CEF saiu (transferência)

    if (origem && origem.startsWith('CEF_')) {
      const { rows: outra } = await client.query(
        `SELECT d.sienge_id, p.name FROM dfc_plano_contas d
           JOIN planos_financeiros_sienge p ON p.empresa_id = d.empresa_id AND p.sienge_id = d.sienge_id
          WHERE d.empresa_id = $1 AND d.origem_projecao = $2 AND d.sienge_id <> $3
          FOR UPDATE OF d`,
        [empresaId, origem, siengeId]
      );
      if (outra[0] && !transferir) {
        const e = erro(409, `Essa origem já está na conta ${outra[0].sienge_id} - ${outra[0].name}.`);
        e.codigo = 'ORIGEM_CEF_EM_USO';
        e.conta = { sienge_id: outra[0].sienge_id, name: outra[0].name };
        throw e;
      }
      if (outra[0]) {
        await client.query(
          'UPDATE dfc_plano_contas SET origem_projecao = NULL WHERE empresa_id = $1 AND sienge_id = $2',
          [empresaId, outra[0].sienge_id]
        );
        // Sem máscara também, a linha fica vazia — apaga.
        await client.query(
          'DELETE FROM dfc_plano_contas WHERE empresa_id = $1 AND sienge_id = $2 AND mascara_id IS NULL AND origem_projecao IS NULL',
          [empresaId, outra[0].sienge_id]
        );
        liberada = outra[0].sienge_id;
      }
    }

    let salvo;
    if (mascaraId === null && origem === null) {
      await client.query('DELETE FROM dfc_plano_contas WHERE empresa_id = $1 AND sienge_id = $2', [empresaId, siengeId]);
      salvo = { sienge_id: siengeId, mascara_id: null, origem_projecao: null };
    } else {
      const { rows } = await client.query(
        `INSERT INTO dfc_plano_contas (empresa_id, sienge_id, mascara_id, origem_projecao)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (empresa_id, sienge_id)
         DO UPDATE SET mascara_id = EXCLUDED.mascara_id, origem_projecao = EXCLUDED.origem_projecao
         RETURNING sienge_id, mascara_id, origem_projecao`,
        [empresaId, siengeId, mascaraId, origem]
      );
      salvo = rows[0];
    }
    await client.query('COMMIT');
    return { ...salvo, origem_retirada_de: liberada };
  } catch (e) {
    await client.query('ROLLBACK');
    // Corrida entre duas gravações: o índice único segura e vira a mesma resposta de "em uso".
    if (e.code === '23505') throw erro(409, 'Essa origem CEF já está em outra conta. Recarregue a tela.');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { list, update };
