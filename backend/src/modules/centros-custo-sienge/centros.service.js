const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const siengeApi = require('./sienge-api.client');

async function listGerados() {
  const { rows } = await pool.query(
    `SELECT e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj,
            COUNT(c.sienge_id)::int AS total_itens,
            MAX(c.atualizado_em) AS atualizado_em
     FROM centros_custo_sienge c
     JOIN empresas e ON e.id = c.empresa_id
     GROUP BY e.id, e.razao_social, e.nome_fantasia, e.cnpj
     ORDER BY e.razao_social ASC`
  );
  return rows;
}

async function listItens(empresaId, { page = 1, limit = 15, search = '' }) {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;

  const { rows } = await pool.query(
    `SELECT sienge_id, name, commercial_name, cnpj, company_name,
            cost_database_description, building_type_description,
            status, apelido, criado_em, atualizado_em
     FROM centros_custo_sienge
     WHERE empresa_id = $1 AND (name ILIKE $2 OR sienge_id::text ILIKE $2)
     ORDER BY sienge_id::text ASC
     LIMIT $3 OFFSET $4`,
    [empresaId, searchTerm, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM centros_custo_sienge
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

async function listItensParaExportacao(empresaId) {
  const { rows } = await pool.query(
    `SELECT c.sienge_id, c.name, c.commercial_name, c.cnpj, c.company_name,
            c.tipo, c.endereco, c.cost_database_description, c.building_type_description,
            c.status, c.apelido, m.descricao AS unidade_negocio_descricao,
            c.numero_unidades, c.codigo_prevision, c.prevision_primary_view, c.codigo_construtor_vendas,
            c.codigo_contrato_caixa, c.cep, c.cidade_enriquecida, c.estado_enriquecido,
            c.valor_geral_vendas, c.faixa, c.data_criacao, c.data_modificacao, c.atualizado_em
     FROM centros_custo_sienge c
     LEFT JOIN mascara_itens m ON m.id = c.unidade_negocio_id
     WHERE c.empresa_id = $1
     ORDER BY c.sienge_id::text ASC`,
    [empresaId]
  );
  return rows;
}

async function getItem(empresaId, siengeId) {
  const { rows } = await pool.query(
    `SELECT c.*, m.descricao AS unidade_negocio_descricao
     FROM centros_custo_sienge c
     LEFT JOIN mascara_itens m ON m.id = c.unidade_negocio_id
     WHERE c.empresa_id = $1 AND c.sienge_id = $2`,
    [empresaId, siengeId]
  );
  return rows[0] || null;
}

async function updateEnriquecimento(empresaId, siengeId, data) {
  const { rows } = await pool.query(
    `UPDATE centros_custo_sienge SET
       status = $1,
       apelido = $2,
       unidade_negocio_id = $3,
       numero_unidades = $4,
       codigo_prevision = $5,
       prevision_primary_view = $6,
       codigo_construtor_vendas = $7,
       codigo_contrato_caixa = $8,
       cep = $9,
       cidade_enriquecida = $10,
       estado_enriquecido = $11,
       valor_geral_vendas = $12,
       faixa = $13
     WHERE empresa_id = $14 AND sienge_id = $15
     RETURNING *`,
    [
      data.status,
      data.apelido || null,
      data.unidade_negocio_id || null,
      data.numero_unidades || null,
      data.codigo_prevision || null,
      data.prevision_primary_view,
      data.codigo_construtor_vendas || null,
      data.codigo_contrato_caixa || null,
      data.cep || null,
      data.cidade_enriquecida || null,
      data.estado_enriquecido || null,
      data.valor_geral_vendas || null,
      data.faixa || null,
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

async function upsertItens(empresaId, itens) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of itens) {
      await client.query(
        `INSERT INTO centros_custo_sienge
           (sienge_id, empresa_id, name, commercial_name, enterprise_observation, cnpj, tipo,
            endereco, data_criacao, data_modificacao, criado_por, modificado_por,
            company_id, company_name, cost_database_id, cost_database_description,
            building_type_id, building_type_description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (sienge_id, empresa_id) DO UPDATE SET
           name = EXCLUDED.name,
           commercial_name = EXCLUDED.commercial_name,
           enterprise_observation = EXCLUDED.enterprise_observation,
           cnpj = EXCLUDED.cnpj,
           tipo = EXCLUDED.tipo,
           endereco = EXCLUDED.endereco,
           data_criacao = EXCLUDED.data_criacao,
           data_modificacao = EXCLUDED.data_modificacao,
           criado_por = EXCLUDED.criado_por,
           modificado_por = EXCLUDED.modificado_por,
           company_id = EXCLUDED.company_id,
           company_name = EXCLUDED.company_name,
           cost_database_id = EXCLUDED.cost_database_id,
           cost_database_description = EXCLUDED.cost_database_description,
           building_type_id = EXCLUDED.building_type_id,
           building_type_description = EXCLUDED.building_type_description`,
        [
          item.id,
          empresaId,
          item.name,
          item.commercialName || null,
          item.enterpriseObservation || null,
          item.cnpj || null,
          item.type || null,
          item.adress || null,
          item.creationDate || null,
          item.modificationDate || null,
          item.createdBy || null,
          item.modifiedBy || null,
          item.companyId || null,
          item.companyName || null,
          item.costDatabaseId || null,
          item.costDatabaseDescription || null,
          item.buildingTypeId || null,
          item.buildingTypeDescription || null,
        ]
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

async function gerar(empresaId) {
  const empresa = await getEmpresaComIntegracao(empresaId);
  if (!empresa) {
    const err = new Error('Esta empresa não possui uma integração Sienge ativa configurada.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const password = decrypt(empresa.password_enc);
  const itens = await siengeApi.fetchAllEnterprises({
    tenant: empresa.tenant,
    username: empresa.username,
    password,
  });

  await upsertItens(empresaId, itens);

  return { empresa_id: empresaId, total_importado: itens.length };
}

async function listEtapas(empresaId, siengeId) {
  // Traz TODAS as etapas cadastradas na máscara "Etapas do Centro de Custo" da
  // empresa (ordenadas pela sequência da máscara), com as datas de início/fim
  // já preenchidas quando existir um histórico para aquele centro de custo.
  const { rows } = await pool.query(
    `SELECT m.id AS mascara_item_id, m.sequencia AS etapa_sequencia, m.descricao AS etapa_descricao,
            h.id AS historico_id, h.data_inicio, h.data_fim, h.criado_em, h.atualizado_em
     FROM mascara_itens m
     LEFT JOIN centro_custo_etapas_historico h
       ON h.mascara_item_id = m.id AND h.empresa_id = $1 AND h.sienge_id = $2
     WHERE m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.empresa_id = $1
     ORDER BY m.sequencia ASC`,
    [empresaId, siengeId]
  );
  return rows;
}

// A sobreposição só faz sentido dentro da MESMA etapa (mascara_item_id) —
// etapas diferentes (ex.: Lançamento e Obras) podem, e normalmente devem,
// ocorrer em períodos sobrepostos.
async function checkOverlap(empresaId, siengeId, mascaraItemId, dataInicio, dataFim, excludeId) {
  const { rows } = await pool.query(
    `SELECT id FROM centro_custo_etapas_historico
     WHERE empresa_id = $1 AND sienge_id = $2 AND mascara_item_id = $3
       AND id != COALESCE($6, -1)
       AND $4::date <= COALESCE(data_fim, 'infinity'::date)
       AND data_inicio <= COALESCE($5::date, 'infinity'::date)`,
    [empresaId, siengeId, mascaraItemId, dataInicio, dataFim, excludeId || null]
  );
  return rows.length > 0;
}

async function createEtapa(empresaId, siengeId, { mascara_item_id, data_inicio, data_fim }) {
  const overlapping = await checkOverlap(empresaId, siengeId, mascara_item_id, data_inicio, data_fim);
  if (overlapping) {
    const err = new Error('Já existe um período cadastrado para esta etapa que se sobrepõe a essas datas.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const { rows } = await pool.query(
    `INSERT INTO centro_custo_etapas_historico (sienge_id, empresa_id, mascara_item_id, data_inicio, data_fim)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, mascara_item_id, data_inicio, data_fim, criado_em, atualizado_em`,
    [siengeId, empresaId, mascara_item_id, data_inicio, data_fim || null]
  );
  return rows[0];
}

async function updateEtapa(id, empresaId, siengeId, { mascara_item_id, data_inicio, data_fim }) {
  const overlapping = await checkOverlap(empresaId, siengeId, mascara_item_id, data_inicio, data_fim, id);
  if (overlapping) {
    const err = new Error('Já existe um período cadastrado para esta etapa que se sobrepõe a essas datas.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const { rows } = await pool.query(
    `UPDATE centro_custo_etapas_historico
     SET mascara_item_id = $1, data_inicio = $2, data_fim = $3
     WHERE id = $4 AND empresa_id = $5 AND sienge_id = $6
     RETURNING id, mascara_item_id, data_inicio, data_fim, criado_em, atualizado_em`,
    [mascara_item_id, data_inicio, data_fim || null, id, empresaId, siengeId]
  );
  return rows[0] || null;
}

async function removeEtapa(id, empresaId, siengeId) {
  const { rowCount } = await pool.query(
    'DELETE FROM centro_custo_etapas_historico WHERE id = $1 AND empresa_id = $2 AND sienge_id = $3',
    [id, empresaId, siengeId]
  );
  return rowCount > 0;
}

module.exports = {
  listGerados,
  listItens,
  listItensParaExportacao,
  gerar,
  getItem,
  updateEnriquecimento,
  listEtapas,
  createEtapa,
  updateEtapa,
  removeEtapa,
};
