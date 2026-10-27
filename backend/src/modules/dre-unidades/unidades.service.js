const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const siengeUnitsApi = require('./sienge-units-api.client');
const progresso = require('../repasses-cef/progressoSincronizacao');
const repassesCefService = require('../repasses-cef/repassesCef.service');

// Operações > DRE Gerencial > Unidades: unidades dos empreendimentos (/units do Sienge) em
// sie_units — mesma lógica da sincronização de contratos do Repasses CEF
// (repassesCef.service.js::sincronizarContratos): busca tudo paginado, guarda o progresso em
// memória pra barra do log e substitui o que estava salvo da empresa (apaga e reinsere). A análise
// (listar) cruza com os contratos de venda (sie_sales_contracts + sie_sales_contracts_units), que
// a aba atualiza junto, pela própria sincronização do Repasses CEF.

// Chaves do progresso em memória (progressoSincronizacao.js é por empresa + tipo). 'sienge' é a
// que a sincronização de contratos do Repasses CEF já usa.
const TIPO_PROGRESSO = 'sienge-units';
const TIPO_PROGRESSO_CONTRATOS = 'sienge';

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

// Contratos de venda (/sales-contracts) — a mesma sincronização do Repasses CEF (substitui
// sie_sales_contracts da empresa, com compradores e unidades de cada contrato).
function sincronizarContratos(empresaId) {
  return repassesCefService.sincronizarContratos(empresaId);
}

// Progresso "ao vivo" das sincronizações em andamento — o frontend faz polling enquanto espera os POSTs.
function getStatusSincronizacao(empresaId) {
  return {
    unidades: progresso.get(empresaId, TIPO_PROGRESSO),
    contratos: progresso.get(empresaId, TIPO_PROGRESSO_CONTRATOS),
  };
}

// Estoque comercial (commercial_stock) do Sienge que conta como vendido hoje: Vendida,
// Vendido/Terceiros e Vendida em Pré-contrato (ver frontend/src/utils/statusUnidade.js). Permuta = E.
const ESTOQUE_VENDIDO = new Set(['V', 'G', 'O']);
const ESTOQUE_PERMUTA = 'E';

function num(valor) {
  return valor === null || valor === undefined ? null : Number(valor);
}

// Ordem natural do nome da unidade (101, 102… 1001) e, empatando, pela data.
function ordenar(linhas) {
  return linhas.sort(
    (a, b) =>
      (a.unidade || '').localeCompare(b.unidade || '', 'pt-BR', { numeric: true }) ||
      String(a.data || '').localeCompare(String(b.data || ''))
  );
}

// Análise das unidades por centro de custo (só os com "Realiza DRE"), em 4 clusters (pedido do
// usuário) — a mesma unidade entra em todos em que se encaixa (ex.: vendida, distratada e hoje em
// estoque aparece em Vendidas, Distratadas e Unidades disponíveis):
//   vendidas    — todo contrato de venda, de qualquer situação (o cancelado também foi uma venda):
//                 uma linha por contrato × unidade; data = data do contrato, valor = valor do contrato.
//   distratadas — contratos cancelados; data = data do cancelamento, valor = valor do contrato.
//   permuta     — unidades com estoque Permuta; data e valor = avaliação (sale_value_date/price).
//   disponiveis — unidades que hoje não estão vendidas nem em permuta; sem data, valor estimado
//                 pelo ticket médio das vendas ativas (não canceladas) do mesmo tipo no mesmo
//                 empreendimento (sem venda desse tipo, fica sem valor).
// "Valor do contrato" = `value` (soma das condições de pagamento), não `total_selling_value`.
// Contrato com mais de uma unidade: o valor de cada uma é o do contrato × participação da unidade.
async function listar(empresaId) {
  const { rows: unidades } = await pool.query(
    `SELECT u.sienge_unit_id::int AS id, u.enterprise_id::int AS centro_id, c.name AS centro, u.name,
            u.property_type, u.commercial_stock, u.ideal_fraction,
            to_char(u.sale_value_date, 'YYYY-MM-DD') AS sale_value_date, u.sale_value_price
       FROM sie_units u
       JOIN centros_custo_sienge c ON c.empresa_id = u.empresa_id AND c.sienge_id = u.enterprise_id
      WHERE u.empresa_id = $1 AND c.realiza_dre`,
    [empresaId]
  );
  const { rows: contratos } = await pool.query(
    `SELECT k.sienge_contract_id::int AS contrato_id, k.number, k.situation, k.enterprise_id::int AS centro_id,
            cc.name AS centro, to_char(k.contract_date, 'YYYY-MM-DD') AS contract_date,
            to_char(k.cancellation_date, 'YYYY-MM-DD') AS cancellation_date, k.cancellation_reason, k.value,
            cu.unit_id::int AS unit_id, cu.name AS unit_name, cu.participation_percentage
       FROM sie_sales_contracts k
       JOIN sie_sales_contracts_units cu ON cu.sienge_contract_id = k.sienge_contract_id AND cu.empresa_id = k.empresa_id
       JOIN centros_custo_sienge cc ON cc.empresa_id = k.empresa_id AND cc.sienge_id = k.enterprise_id
      WHERE k.empresa_id = $1 AND cc.realiza_dre`,
    [empresaId]
  );
  const { rows: ultimas } = await pool.query(
    `SELECT (SELECT MAX(criado_em) FROM sie_units WHERE empresa_id = $1) AS unidades,
            (SELECT MAX(criado_em) FROM sie_sales_contracts WHERE empresa_id = $1) AS contratos`,
    [empresaId]
  );

  const unidadePorId = new Map(unidades.map((u) => [u.id, u]));
  const centros = new Map();
  const centro = (id, nome) => {
    if (!centros.has(id)) {
      centros.set(id, {
        id,
        nome,
        total_unidades: 0,
        fracao_ideal: 0,
        clusters: { vendidas: [], distratadas: [], permuta: [], disponiveis: [] },
      });
    }
    return centros.get(id);
  };
  const base = (u, nomeReserva) => ({
    unit_id: u?.id ?? null,
    unidade: u?.name ?? nomeReserva ?? null,
    tipo: u?.property_type ?? null,
    situacao_atual: u?.commercial_stock ?? null,
    fracao_ideal: num(u?.ideal_fraction),
  });

  // Contratos → Vendidas (todos) e Distratadas (cancelados); ticket médio das vendas ativas.
  const ticket = new Map(); // `${centro}|${tipo}` -> { soma, n }
  contratos.forEach((k) => {
    const u = unidadePorId.get(k.unit_id);
    const c = centro(k.centro_id, k.centro);
    const participacao = k.participation_percentage === null ? 1 : Number(k.participation_percentage) / 100;
    const valor = k.value === null ? null : Number(k.value) * participacao;
    const cancelado = k.situation === 'Cancelado' || Boolean(k.cancellation_date);
    const contrato = { id: k.contrato_id, numero: k.number, cancelado, motivo: k.cancellation_reason || null };
    c.clusters.vendidas.push({ ...base(u, k.unit_name), chave: `v${k.contrato_id}-${k.unit_id}`, data: k.contract_date, valor, contrato });
    if (cancelado) {
      c.clusters.distratadas.push({
        ...base(u, k.unit_name),
        chave: `d${k.contrato_id}-${k.unit_id}`,
        data: k.cancellation_date,
        valor,
        contrato,
      });
    } else if (u && valor !== null) {
      const chave = `${u.centro_id}|${u.property_type}`;
      const t = ticket.get(chave) || { soma: 0, n: 0 };
      ticket.set(chave, { soma: t.soma + valor, n: t.n + 1 });
    }
  });

  // Unidades → Permuta e Unidades disponíveis (pela situação de hoje).
  unidades.forEach((u) => {
    const c = centro(u.centro_id, u.centro);
    c.total_unidades += 1;
    c.fracao_ideal += num(u.ideal_fraction) || 0;
    if (u.commercial_stock === ESTOQUE_PERMUTA) {
      c.clusters.permuta.push({
        ...base(u),
        chave: `p${u.id}`,
        data: u.sale_value_date,
        valor: num(u.sale_value_price),
      });
    } else if (!ESTOQUE_VENDIDO.has(u.commercial_stock)) {
      const t = ticket.get(`${u.centro_id}|${u.property_type}`);
      c.clusters.disponiveis.push({
        ...base(u),
        chave: `e${u.id}`,
        data: null,
        valor: t ? t.soma / t.n : null,
        estimado: { vendas: t ? t.n : 0 },
      });
    }
  });

  const lista = [...centros.values()]
    .sort((a, b) => a.id - b.id)
    .map((c) => ({
      ...c,
      clusters: Object.fromEntries(Object.entries(c.clusters).map(([k, linhas]) => [k, ordenar(linhas)])),
    }));
  return { centros: lista, ultima_atualizacao: ultimas[0] };
}

module.exports = { sincronizar, sincronizarContratos, getStatusSincronizacao, listar };
