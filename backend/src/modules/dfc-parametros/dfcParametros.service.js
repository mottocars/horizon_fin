const pool = require('../../config/db');

const CAMPOS = [
  'cto',
  'valor_financiamento_pj',
  'numero_unidades',
  'ticket_medio_avaliacao_pf',
  'pct_coeficiente_garantia',
  'pct_amortizacao_pj',
  'data_demanda_minima',
  'taxa_juros_mes',
  'data_inicio_ciclo',
  'data_fim_ciclo',
  'qtd_vendas_mes',
  'tempo_assinatura_registro_meses',
];

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Empreendimentos (centros de custo ativos do Sienge) da empresa, pro filtro "Centro de Custo".
// `numero_unidades` do cadastro do centro serve de sugestão no primeiro preenchimento.
async function listCentros(empresaId) {
  const { rows } = await pool.query(
    `SELECT sienge_id, name, numero_unidades FROM centros_custo_sienge
      WHERE empresa_id = $1 AND status = 'ATIVO'
      ORDER BY name ASC`,
    [empresaId]
  );
  return rows;
}

// Versões do empreendimento, mais recente primeiro — alimenta o combobox "Versão".
async function listVersoes(empresaId, siengeId) {
  const { rows } = await pool.query(
    `SELECT v.id, v.versao, v.criado_em, u.nome AS criado_por_nome
       FROM dfc_parametros_versoes v
       LEFT JOIN usuarios u ON u.id = v.criado_por_usuario_id
      WHERE v.empresa_id = $1 AND v.sienge_id = $2
      ORDER BY v.versao DESC`,
    [empresaId, siengeId]
  );
  return rows;
}

async function getVersao(empresaId, siengeId, versao, db = pool) {
  const { rows } = await db.query(
    `SELECT v.id, v.empresa_id, v.sienge_id, v.versao, ${CAMPOS.map((c) => `v.${c}`).join(', ')},
            v.criado_em, u.nome AS criado_por_nome
       FROM dfc_parametros_versoes v
       LEFT JOIN usuarios u ON u.id = v.criado_por_usuario_id
      WHERE v.empresa_id = $1 AND v.sienge_id = $2 AND v.versao = $3`,
    [empresaId, siengeId, versao]
  );
  return rows[0] || null;
}

// Cria a próxima versão do empreendimento (MAX(versao) + 1 — nunca sobrescreve), mesmo que os
// valores sejam iguais aos da anterior: é assim que o histórico fica completo (mesmo esquema de
// motorRisco.service.js::criarVersao).
async function criarVersao(empresaId, siengeId, usuarioId, dados) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Trava o centro de custo: confere que ele é da empresa e serializa duas gravações
    // simultâneas do mesmo empreendimento (nunca duas linhas com o mesmo número de versão).
    const { rows: centro } = await client.query(
      'SELECT sienge_id FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2 FOR UPDATE',
      [empresaId, siengeId]
    );
    if (!centro[0]) throw erro(404, 'Centro de custo não encontrado nesta empresa.');

    const { rows: maxRows } = await client.query(
      'SELECT COALESCE(MAX(versao), 0) + 1 AS proxima FROM dfc_parametros_versoes WHERE empresa_id = $1 AND sienge_id = $2',
      [empresaId, siengeId]
    );
    const proxima = maxRows[0].proxima;

    await client.query(
      `INSERT INTO dfc_parametros_versoes (empresa_id, sienge_id, versao, ${CAMPOS.join(', ')}, criado_por_usuario_id)
       VALUES ($1, $2, $3, ${CAMPOS.map((_, i) => `$${i + 4}`).join(', ')}, $${CAMPOS.length + 4})`,
      [empresaId, siengeId, proxima, ...CAMPOS.map((c) => dados[c]), usuarioId]
    );

    const criada = await getVersao(empresaId, siengeId, proxima, client);
    await client.query('COMMIT');
    return criada;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { listCentros, listVersoes, getVersao, criarVersao };
