const pool = require('../../config/db');

// Lista todas as versões salvas da empresa, mais recente primeiro — alimenta
// o combobox "Versão" da tela.
async function listVersoes(empresaId) {
  const { rows } = await pool.query(
    `SELECT v.id, v.versao, v.criado_em, u.nome AS criado_por_nome
     FROM motor_risco_versoes v
     LEFT JOIN usuarios u ON u.id = v.criado_por_usuario_id
     WHERE v.empresa_id = $1
     ORDER BY v.versao DESC`,
    [empresaId]
  );
  return rows;
}

async function getVersaoDetalhada(client, empresaId, versao) {
  const { rows } = await client.query(
    `SELECT v.id, v.empresa_id, v.versao, v.tolerancia_dias, v.janela_observacao_meses,
            v.gatilho_reincidencia_dias, v.minimo_parcelas, v.dia_recalculo,
            v.trava_subida_parcelas, v.dias_vencidos_regua_cobranca,
            v.corte_bom_pagador, v.corte_pagador_duvidoso,
            v.criado_em, u.nome AS criado_por_nome
     FROM motor_risco_versoes v
     LEFT JOIN usuarios u ON u.id = v.criado_por_usuario_id
     WHERE v.empresa_id = $1 AND v.versao = $2`,
    [empresaId, versao]
  );
  const versaoRow = rows[0];
  if (!versaoRow) return null;

  const { rows: indicadores } = await client.query(
    `SELECT indicador, nota_0, nota_100, peso FROM motor_risco_indicadores WHERE versao_id = $1 ORDER BY id`,
    [versaoRow.id]
  );
  return { ...versaoRow, indicadores };
}

async function getVersao(empresaId, versao) {
  return getVersaoDetalhada(pool, empresaId, versao);
}

// Cria a próxima versão da empresa (MAX(versao) + 1 — nunca reaproveita nem
// sobrescreve uma versão existente) com os parâmetros e indicadores
// informados. Sempre um INSERT novo, mesmo que os valores sejam idênticos à
// versão anterior — é assim que o histórico fica completo.
async function criarVersao(empresaId, usuarioId, dados) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Trava a linha da empresa (não dá pra travar direto um MAX/agregação)
    // pra serializar duas gravações simultâneas de versão da mesma empresa
    // e nunca gerar duas linhas com o mesmo número de versão.
    await client.query('SELECT id FROM empresas WHERE id = $1 FOR UPDATE', [empresaId]);

    const { rows: maxRows } = await client.query(
      'SELECT COALESCE(MAX(versao), 0) + 1 AS proxima FROM motor_risco_versoes WHERE empresa_id = $1',
      [empresaId]
    );
    const proximaVersao = maxRows[0].proxima;

    const { rows } = await client.query(
      `INSERT INTO motor_risco_versoes (
         empresa_id, versao, tolerancia_dias, janela_observacao_meses,
         gatilho_reincidencia_dias, minimo_parcelas, dia_recalculo,
         trava_subida_parcelas, dias_vencidos_regua_cobranca,
         corte_bom_pagador, corte_pagador_duvidoso, criado_por_usuario_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, versao`,
      [
        empresaId,
        proximaVersao,
        dados.tolerancia_dias,
        dados.janela_observacao_meses,
        dados.gatilho_reincidencia_dias,
        dados.minimo_parcelas,
        dados.dia_recalculo,
        dados.trava_subida_parcelas,
        dados.dias_vencidos_regua_cobranca,
        dados.corte_bom_pagador,
        dados.corte_pagador_duvidoso,
        usuarioId,
      ]
    );
    const versaoId = rows[0].id;

    for (const indicador of dados.indicadores) {
      await client.query(
        `INSERT INTO motor_risco_indicadores (versao_id, indicador, nota_0, nota_100, peso)
         VALUES ($1,$2,$3,$4,$5)`,
        [versaoId, indicador.indicador, indicador.nota_0, indicador.nota_100, indicador.peso]
      );
    }

    const versaoCompleta = await getVersaoDetalhada(client, empresaId, rows[0].versao);
    await client.query('COMMIT');
    return versaoCompleta;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { listVersoes, getVersao, criarVersao };
