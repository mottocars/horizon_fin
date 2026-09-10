const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const siengeApi = require('./sienge-api.client');

async function listGerados() {
  const { rows } = await pool.query(
    `SELECT e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj,
            COUNT(p.sienge_id)::int AS total_contas,
            MAX(p.atualizado_em) AS atualizado_em
     FROM planos_financeiros_sienge p
     JOIN empresas e ON e.id = p.empresa_id
     GROUP BY e.id, e.razao_social, e.nome_fantasia, e.cnpj
     ORDER BY e.razao_social ASC`
  );
  return rows;
}

async function listContas(empresaId, { page = 1, limit = 15, search = '' }) {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;

  const { rows } = await pool.query(
    `SELECT sienge_id, name, tp_conta, fl_redutora, fl_ativa, fl_adiantamento, fl_imposto,
            mascara_nivel_1, mascara_nivel_2, mascara_nivel_3, mascara_nivel_4, mascara_nivel_5,
            mascara_nivel_6, mascara_nivel_7,
            criado_em, atualizado_em
     FROM planos_financeiros_sienge
     WHERE empresa_id = $1 AND (name ILIKE $2 OR sienge_id::text ILIKE $2)
     ORDER BY sienge_id::text ASC
     LIMIT $3 OFFSET $4`,
    [empresaId, searchTerm, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM planos_financeiros_sienge
     WHERE empresa_id = $1 AND (name ILIKE $2 OR sienge_id::text ILIKE $2)`,
    [empresaId, searchTerm]
  );

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total: countRows[0].total,
      totalPages: Math.max(1, Math.ceil(countRows[0].total / limit)),
    },
  };
}

async function getItem(empresaId, siengeId) {
  const { rows } = await pool.query(
    `SELECT p.*,
            dre.descricao AS classificacao_dre_descricao,
            dfc.descricao AS classificacao_dfc_descricao,
            sub_dre.descricao AS submascara_dre_descricao,
            sub_dfc.descricao AS submascara_dfc_descricao,
            pac.descricao AS pacote_descricao
     FROM planos_financeiros_sienge p
     LEFT JOIN mascara_itens dre ON dre.id = p.classificacao_dre_id
     LEFT JOIN mascara_itens dfc ON dfc.id = p.classificacao_dfc_id
     LEFT JOIN mascara_itens sub_dre ON sub_dre.id = p.submascara_dre_id
     LEFT JOIN mascara_itens sub_dfc ON sub_dfc.id = p.submascara_dfc_id
     LEFT JOIN mascara_itens pac ON pac.id = p.pacote_id
     WHERE p.empresa_id = $1 AND p.sienge_id = $2`,
    [empresaId, siengeId]
  );
  return rows[0] || null;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

async function updateEnriquecimento(empresaId, siengeId, data) {
  const item = await getItem(empresaId, siengeId);
  if (!item) return null;
  if (item.tp_conta === 'T') {
    const err = new Error('Contas totalizadoras (tp_conta = T) não podem ser editadas.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const mesColumns = MESES.map((mes) => `incremento_${mes}`);
  const mesValues = MESES.map((mes) => data[`incremento_${mes}`] ?? null);

  const { rows } = await pool.query(
    `UPDATE planos_financeiros_sienge SET
       classificacao_dre_id = $1,
       classificacao_dfc_id = $2,
       submascara_dre_id = $3,
       submascara_dfc_id = $4,
       projeta_mes_atual_dfc = $5,
       pacote_id = $6,
       tipo_projecao = $7,
       quantidade_meses = $8,
       gera_orcamento = $9,
       fonte_dados = $10,
       regra_calculo = $11,
       ${mesColumns.map((col, i) => `${col} = $${12 + i}`).join(', ')}
     WHERE empresa_id = $${12 + mesColumns.length} AND sienge_id = $${13 + mesColumns.length}
     RETURNING *`,
    [
      data.classificacao_dre_id || null,
      data.classificacao_dfc_id || null,
      data.submascara_dre_id || null,
      data.submascara_dfc_id || null,
      data.projeta_mes_atual_dfc ?? null,
      data.pacote_id || null,
      data.tipo_projecao || null,
      data.quantidade_meses ?? null,
      data.gera_orcamento ?? null,
      data.fonte_dados || null,
      data.regra_calculo || null,
      ...mesValues,
      empresaId,
      siengeId,
    ]
  );
  return rows[0] || null;
}

async function getEmpresaComIntegracao(empresaId) {
  const { rows } = await pool.query(
    `SELECT e.id AS empresa_id, e.razao_social,
            s.tenant, s.username, s.password_enc
     FROM empresas e
     JOIN integracoes_sienge s ON s.empresa_id = e.id AND s.ativo = TRUE
     WHERE e.id = $1`,
    [empresaId]
  );
  return rows[0] || null;
}

const MASCARA_NIVEIS_MAX = 7;
const MASCARA_COLUNAS = Array.from({ length: MASCARA_NIVEIS_MAX }, (_, i) => `mascara_nivel_${i + 1}`);

async function upsertContas(empresaId, contas, mascaraNiveis) {
  const definirMascara = Array.isArray(mascaraNiveis);
  const niveisPreenchidos = definirMascara
    ? [...mascaraNiveis, ...Array(MASCARA_NIVEIS_MAX).fill(null)].slice(0, MASCARA_NIVEIS_MAX)
    : Array(MASCARA_NIVEIS_MAX).fill(null);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const conta of contas) {
      const baseParams = [
        conta.id,
        empresaId,
        conta.name,
        conta.tpConta || null,
        conta.flRedutora || null,
        conta.flAtiva || null,
        conta.flAdiantamento || null,
        conta.flImposto || null,
      ];
      const mascaraParams = niveisPreenchidos.map((n) => n || null);
      const flagIndex = baseParams.length + mascaraParams.length + 1;

      await client.query(
        `INSERT INTO planos_financeiros_sienge
           (sienge_id, empresa_id, name, tp_conta, fl_redutora, fl_ativa, fl_adiantamento, fl_imposto,
            ${MASCARA_COLUNAS.join(', ')})
         VALUES (${baseParams.map((_, i) => `$${i + 1}`).join(', ')},
                 ${mascaraParams.map((_, i) => `$${baseParams.length + i + 1}`).join(', ')})
         ON CONFLICT (sienge_id, empresa_id) DO UPDATE SET
           name = EXCLUDED.name,
           tp_conta = EXCLUDED.tp_conta,
           fl_redutora = EXCLUDED.fl_redutora,
           fl_ativa = EXCLUDED.fl_ativa,
           fl_adiantamento = EXCLUDED.fl_adiantamento,
           fl_imposto = EXCLUDED.fl_imposto,
           ${MASCARA_COLUNAS.map(
             (col, i) =>
               `${col} = CASE WHEN $${flagIndex} THEN $${baseParams.length + i + 1} ELSE planos_financeiros_sienge.${col} END`
           ).join(', ')}`,
        [...baseParams, ...mascaraParams, definirMascara]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function gerar(empresaId, mascaraNiveis) {
  const empresa = await getEmpresaComIntegracao(empresaId);
  if (!empresa) {
    const err = new Error('Esta empresa não possui uma integração Sienge ativa configurada.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const password = decrypt(empresa.password_enc);
  const contas = await siengeApi.fetchPaymentCategories({
    tenant: empresa.tenant,
    username: empresa.username,
    password,
  });

  await upsertContas(empresaId, contas, mascaraNiveis);

  return { empresa_id: empresaId, total_importado: contas.length };
}

module.exports = { listGerados, listContas, gerar, getItem, updateEnriquecimento };
