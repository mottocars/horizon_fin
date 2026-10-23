const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const siengeUnitsApi = require('./sienge-units-api.client');
const progresso = require('../repasses-cef/progressoSincronizacao');

// Operações > DRE Gerencial > Fração Ideal: unidades dos empreendimentos (/units do Sienge) em
// sie_units — mesma lógica da sincronização de contratos do Repasses CEF
// (repassesCef.service.js::sincronizarContratos): busca tudo paginado, guarda o progresso em
// memória pra barra do log e substitui o que estava salvo da empresa (apaga e reinsere).

// Chave do progresso em memória (progressoSincronizacao.js é por empresa + tipo).
const TIPO_PROGRESSO = 'sienge-units';

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

function vazioParaNulo(valor) {
  return valor === '' || valor === undefined ? null : valor;
}

function data(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function json(valor) {
  return valor === null || valor === undefined ? null : JSON.stringify(valor);
}

async function getCredenciaisSiengeAtivas(empresaId) {
  const { rows } = await pool.query(
    'SELECT tenant, username, password_enc FROM integracoes_sienge WHERE empresa_id = $1 AND ativo = TRUE',
    [empresaId]
  );
  return rows[0] || null;
}

// Campos da unidade (endpoint /units), achatados — camelCase da API pro snake_case da coluna.
// `conv` trata datas e objetos (JSONB); o resto vai como veio.
const CAMPOS_UNIDADE = [
  ['enterprise_id', (u) => u.enterpriseId],
  ['contract_id', (u) => u.contractId],
  ['indexer_id', (u) => u.indexerId],
  ['name', (u) => u.name],
  ['property_type', (u) => u.propertyType],
  ['note', (u) => u.note],
  ['commercial_stock', (u) => u.commercialStock],
  ['latitude', (u) => u.latitude],
  ['longitude', (u) => u.longitude],
  ['legal_registration_number', (u) => u.legalRegistrationNumber],
  ['delivery_date', (u) => data(u.deliveryDate)],
  ['scheduled_delivery_date', (u) => data(u.scheduledDeliveryDate)],
  ['private_area', (u) => u.privateArea],
  ['common_area', (u) => u.commonArea],
  ['terrain_area', (u) => u.terrainArea],
  ['non_proportional_common_area', (u) => u.nonProportionalCommonArea],
  ['ideal_fraction', (u) => u.idealFraction],
  ['ideal_fraction_square_meter', (u) => u.idealFractionSquareMeter],
  ['general_sale_value_fraction', (u) => u.generalSaleValueFraction],
  ['indexed_quantity', (u) => u.indexedQuantity],
  ['prized_compliance', (u) => u.prizedCompliance],
  ['terrain_value', (u) => u.terrainValue],
  ['floor', (u) => u.floor],
  ['contract_number', (u) => u.contractNumber],
  ['usable_area', (u) => u.usableArea],
  ['iptu_value', (u) => u.iptuValue],
  ['real_estate_registration', (u) => u.realEstateRegistration],
  ['cib_code', (u) => u.cibCode],
  ['incra_code', (u) => u.incraCode],
  ['location_type', (u) => u.locationType],
  ['framework_type', (u) => u.frameworkType],
  ['evaluation_date', (u) => data(u.evaluation?.evaluationDate)],
  ['evaluation_price', (u) => u.evaluation?.evaluationPrice],
  ['sale_value_date', (u) => data(u.evaluation?.saleValueDate)],
  ['sale_value_price', (u) => u.evaluation?.saleValuePrice],
  ['address_city_id', (u) => u.address?.cityId],
  ['address_city', (u) => u.address?.city],
  ['address_street_name', (u) => u.address?.streetName],
  ['address_complement', (u) => u.address?.complement],
  ['address_number', (u) => u.address?.number],
  ['address_neighborhood', (u) => u.address?.neighborhood],
  ['address_zip_code', (u) => u.address?.zipCode],
  ['address_street_type', (u) => u.address?.streetType],
  ['child_units', (u) => json(u.childUnits)],
  ['groupings', (u) => json(u.groupings)],
  ['special_values', (u) => json(u.specialValues)],
  ['links', (u) => json(u.links)],
];

const COLUNAS_UNIDADE = ['sienge_unit_id', 'empresa_id', ...CAMPOS_UNIDADE.map(([col]) => col)];

async function inserirUnidade(client, empresaId, unidade) {
  const valores = [unidade.id, empresaId, ...CAMPOS_UNIDADE.map(([, campo]) => vazioParaNulo(campo(unidade)))];
  const placeholders = valores.map((_, i) => `$${i + 1}`).join(', ');
  await client.query(
    `INSERT INTO sie_units (${COLUNAS_UNIDADE.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (sienge_unit_id, empresa_id) DO NOTHING`,
    valores
  );
}

// Puxa TODAS as unidades da API do Sienge (/units) pra essa empresa e substitui completamente o
// que já estava salvo — mesmo critério dos contratos: apaga tudo e reinsere, pra nunca duplicar.
// `onProgress` (opcional): chamado a cada página com { paginaAtual, totalPaginas }.
async function sincronizar(empresaId, onProgress) {
  const credenciais = await getCredenciaisSiengeAtivas(empresaId);
  if (!credenciais) throw erro(400, 'Esta empresa não possui uma integração Sienge ativa configurada.');

  const password = decrypt(credenciais.password_enc);
  try {
    const unidades = await siengeUnitsApi.fetchAllUnits({
      tenant: credenciais.tenant,
      username: credenciais.username,
      password,
      onProgress: (p) => {
        progresso.set(empresaId, TIPO_PROGRESSO, p);
        onProgress?.(p);
      },
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM sie_units WHERE empresa_id = $1', [empresaId]);
      for (const unidade of unidades) {
        if (!unidade || unidade.id === undefined || unidade.id === null) continue;
        await inserirUnidade(client, empresaId, unidade);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return { total_importado: unidades.length };
  } finally {
    progresso.clear(empresaId, TIPO_PROGRESSO);
  }
}

// Progresso "ao vivo" da sincronização em andamento — o frontend faz polling enquanto espera o POST.
function getStatusSincronizacao(empresaId) {
  return { sienge: progresso.get(empresaId, TIPO_PROGRESSO) };
}

// Unidades dos centros de custo com "Realiza DRE" (aba Centros Custos), com o nome do centro, e a
// data da última sincronização (como sincroniza apagando e reinserindo, MAX(criado_em) é ela).
async function listar(empresaId) {
  const { rows: unidades } = await pool.query(
    `SELECT u.sienge_unit_id, u.enterprise_id, c.name AS enterprise_name, u.name, u.property_type, u.floor,
            u.commercial_stock, u.private_area, u.common_area, u.terrain_area, u.ideal_fraction,
            u.ideal_fraction_square_meter
       FROM sie_units u
       JOIN centros_custo_sienge c ON c.empresa_id = u.empresa_id AND c.sienge_id = u.enterprise_id
      WHERE u.empresa_id = $1 AND c.realiza_dre
      ORDER BY u.enterprise_id, u.name`,
    [empresaId]
  );
  const { rows: ultima } = await pool.query('SELECT MAX(criado_em) AS ultima FROM sie_units WHERE empresa_id = $1', [
    empresaId,
  ]);
  return { unidades, ultima_atualizacao: ultima[0].ultima };
}

module.exports = { sincronizar, getStatusSincronizacao, listar };
