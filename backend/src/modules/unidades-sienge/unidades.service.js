const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const siengeApi = require('./sienge-api.client');

function parseDate(valor) {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
}

function toNumeroOuNull(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
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

async function upsertUnidades(empresaId, unidades) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const unidade of unidades) {
      const evaluation = unidade.evaluation || {};
      await client.query(
        `INSERT INTO unidades_sienge
           (sienge_unit_id, empresa_id, enterprise_id, contract_id, indexer_id, name, property_type,
            note, commercial_stock, latitude, longitude, legal_registration_number, floor,
            contract_number, delivery_date, scheduled_delivery_date, private_area, common_area,
            terrain_area, non_proportional_common_area, ideal_fraction, ideal_fraction_square_meter,
            general_sale_value_fraction, terrain_value, indexed_quantity, prized_compliance,
            usable_area, iptu_value, real_estate_registration, evaluation_date, evaluation_price,
            sale_value_date, sale_value_price, sale_value_price_original, child_units, groupings, special_values)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
                 $23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37)
         ON CONFLICT (sienge_unit_id, empresa_id) DO UPDATE SET
           enterprise_id = EXCLUDED.enterprise_id,
           contract_id = EXCLUDED.contract_id,
           indexer_id = EXCLUDED.indexer_id,
           name = EXCLUDED.name,
           property_type = EXCLUDED.property_type,
           note = EXCLUDED.note,
           commercial_stock = EXCLUDED.commercial_stock,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           legal_registration_number = EXCLUDED.legal_registration_number,
           floor = EXCLUDED.floor,
           contract_number = EXCLUDED.contract_number,
           delivery_date = EXCLUDED.delivery_date,
           scheduled_delivery_date = EXCLUDED.scheduled_delivery_date,
           private_area = EXCLUDED.private_area,
           common_area = EXCLUDED.common_area,
           terrain_area = EXCLUDED.terrain_area,
           non_proportional_common_area = EXCLUDED.non_proportional_common_area,
           ideal_fraction = EXCLUDED.ideal_fraction,
           ideal_fraction_square_meter = EXCLUDED.ideal_fraction_square_meter,
           general_sale_value_fraction = EXCLUDED.general_sale_value_fraction,
           terrain_value = EXCLUDED.terrain_value,
           indexed_quantity = EXCLUDED.indexed_quantity,
           prized_compliance = EXCLUDED.prized_compliance,
           usable_area = EXCLUDED.usable_area,
           iptu_value = EXCLUDED.iptu_value,
           real_estate_registration = EXCLUDED.real_estate_registration,
           evaluation_date = EXCLUDED.evaluation_date,
           evaluation_price = EXCLUDED.evaluation_price,
           sale_value_date = EXCLUDED.sale_value_date,
           sale_value_price_original = EXCLUDED.sale_value_price_original,
           child_units = EXCLUDED.child_units,
           groupings = EXCLUDED.groupings,
           special_values = EXCLUDED.special_values`,
        [
          unidade.id,
          empresaId,
          unidade.enterpriseId ?? null,
          unidade.contractId ?? null,
          unidade.indexerId ?? null,
          unidade.name ?? null,
          unidade.propertyType ?? null,
          unidade.note ?? null,
          unidade.commercialStock ?? null,
          unidade.latitude ?? null,
          unidade.longitude ?? null,
          unidade.legalRegistrationNumber ?? null,
          unidade.floor ?? null,
          unidade.contractNumber ?? null,
          parseDate(unidade.deliveryDate),
          parseDate(unidade.scheduledDeliveryDate),
          toNumeroOuNull(unidade.privateArea),
          toNumeroOuNull(unidade.commonArea),
          toNumeroOuNull(unidade.terrainArea),
          toNumeroOuNull(unidade.nonProportionalCommonArea),
          toNumeroOuNull(unidade.idealFraction),
          toNumeroOuNull(unidade.idealFractionSquareMeter),
          toNumeroOuNull(unidade.generalSaleValueFraction),
          toNumeroOuNull(unidade.terrainValue),
          toNumeroOuNull(unidade.indexedQuantity),
          unidade.prizedCompliance ?? null,
          toNumeroOuNull(unidade.usableArea),
          toNumeroOuNull(unidade.iptuValue),
          unidade.realEstateRegistration ?? null,
          parseDate(evaluation.evaluationDate),
          toNumeroOuNull(evaluation.evaluationPrice),
          parseDate(evaluation.saleValueDate),
          toNumeroOuNull(evaluation.saleValuePrice),
          toNumeroOuNull(evaluation.saleValuePrice),
          unidade.childUnits ? JSON.stringify(unidade.childUnits) : null,
          unidade.groupings ? JSON.stringify(unidade.groupings) : null,
          unidade.specialValues ? JSON.stringify(unidade.specialValues) : null,
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

// Vincula cada unidade ao valor do seu contrato de venda (/sales-contracts),
// usando o contract_id que já vem preenchido em cada unidade (/units). É essa
// ligação que dá o valor real de venda (VGV Vendido) — o campo de avaliação
// (evaluation.saleValuePrice) do /units costuma vir vazio.
async function updateValoresContrato(empresaId, contratos) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const contrato of contratos) {
      await client.query(
        `UPDATE unidades_sienge
         SET contract_sale_value = $1, contract_situation = $2, contract_date = $3
         WHERE empresa_id = $4 AND contract_id = $5`,
        [
          toNumeroOuNull(contrato.totalSellingValue ?? contrato.value),
          contrato.situation ?? null,
          parseDate(contrato.contractDate),
          empresaId,
          contrato.id,
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
  const unidades = await siengeApi.fetchAllUnits({
    tenant: empresa.tenant,
    username: empresa.username,
    password,
  });

  await upsertUnidades(empresaId, unidades);

  const contratos = await siengeApi.fetchAllSalesContracts({
    tenant: empresa.tenant,
    username: empresa.username,
    password,
  });

  await updateValoresContrato(empresaId, contratos);

  return { empresa_id: empresaId, total_importado: unidades.length, total_contratos: contratos.length };
}

async function listPorCentroCusto(empresaId, siengeId) {
  const { rows } = await pool.query(
    `SELECT * FROM unidades_sienge
     WHERE empresa_id = $1 AND enterprise_id = $2
     ORDER BY floor ASC NULLS LAST, name ASC`,
    [empresaId, siengeId]
  );
  return rows;
}

// Só entram centros de custo que têm unidades importadas E que já têm um
// range de data cadastrado na etapa "Lançamento" (Histórico de Etapas).
async function listCentrosComUnidades(empresaId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT u.enterprise_id
     FROM unidades_sienge u
     JOIN centro_custo_etapas_historico h
       ON h.sienge_id = u.enterprise_id AND h.empresa_id = u.empresa_id AND h.data_inicio IS NOT NULL
     JOIN mascara_itens m
       ON m.id = h.mascara_item_id AND m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.descricao = 'Lançamento'
     WHERE u.empresa_id = $1 AND u.enterprise_id IS NOT NULL`,
    [empresaId]
  );
  return rows.map((r) => r.enterprise_id);
}

async function updateValor(empresaId, siengeUnitId, valor) {
  const { rows } = await pool.query(
    `UPDATE unidades_sienge SET sale_value_price = $1
     WHERE empresa_id = $2 AND sienge_unit_id = $3
     RETURNING *`,
    [valor, empresaId, siengeUnitId]
  );
  return rows[0] || null;
}

module.exports = { gerar, listPorCentroCusto, listCentrosComUnidades, updateValor };
