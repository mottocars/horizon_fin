const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const { fetchAllIncome } = require('./income-api.client');
// (Sincroniza contas a receber do Sienge — ver income-api.client.js para o
// motivo de a busca ser sempre uma chamada HTTP só, sem paginação.)

async function getIntegracaoAtiva(empresaId) {
  const { rows } = await pool.query(
    'SELECT tenant, username, password_enc FROM integracoes_sienge WHERE empresa_id = $1 AND ativo = TRUE LIMIT 1',
    [empresaId]
  );
  return rows[0] || null;
}

// undefined quebraria o driver do Postgres ("undefined values are not
// allowed") — cada registro da API pode não trazer todo campo, então tudo
// que vai pro banco passa por aqui (null e undefined viram null igual).
function v(valor) {
  return valor === undefined ? null : valor;
}

// Margem de segurança abaixo do limite real do Postgres (65535 parâmetros
// por query) — evita estourar em tabelas com muitas colunas.
const MAX_PARAMETROS_POR_QUERY = 60000;

function montarPlaceholders(qtdLinhas, qtdColunas) {
  const linhas = [];
  let p = 0;
  for (let i = 0; i < qtdLinhas; i++) {
    const cols = [];
    for (let j = 0; j < qtdColunas; j++) {
      p += 1;
      cols.push(`$${p}`);
    }
    linhas.push(`(${cols.join(',')})`);
  }
  return linhas.join(',');
}

// Insere `linhas` (array de arrays de valores, já na ordem de `colunas`) em
// lotes — um bulk-data como o de income pode trazer dezenas de milhares de
// parcelas/recebimentos/movimentos, e um INSERT por linha (o padrão usado
// nas outras sincronizações do projeto, pensadas pra centenas de linhas, não
// dezenas de milhares) levava minutos. Em lotes multi-linha, a mesma carga
// vai em segundos. Quando `retornarId` é true, devolve os ids gerados
// (SERIAL) na mesma ordem de `linhas` — um INSERT ... VALUES (...)
// RETURNING preserva a ordem da lista de valores (confirmado testando
// direto no Postgres; não há JOIN/ORDER BY/agregação que pudesse embaralhar).
async function inserirEmLotes(client, tabela, colunas, linhas, { retornarId = false } = {}) {
  if (linhas.length === 0) return [];

  const porLote = Math.max(1, Math.floor(MAX_PARAMETROS_POR_QUERY / colunas.length));
  const ids = [];

  for (let inicio = 0; inicio < linhas.length; inicio += porLote) {
    const lote = linhas.slice(inicio, inicio + porLote);
    const sql = `INSERT INTO ${tabela} (${colunas.join(',')}) VALUES ${montarPlaceholders(lote.length, colunas.length)}${
      retornarId ? ' RETURNING id' : ''
    }`;
    const { rows } = await client.query(sql, lote.flat());
    if (retornarId) ids.push(...rows.map((row) => row.id));
  }

  return ids;
}

const COLUNAS_PARCELA = [
  'bill_id', 'installment_id', 'empresa_id', 'company_id', 'company_name', 'business_area_id',
  'business_area_name', 'project_id', 'project_name', 'group_company_id', 'group_company_name', 'holding_id',
  'holding_name', 'subsidiary_id', 'subsidiary_name', 'business_type_id', 'business_type_name', 'client_id',
  'client_name', 'document_identification_id', 'document_identification_name', 'document_number',
  'document_forecast', 'origin_id', 'original_amount', 'discount_amount', 'tax_amount', 'indexer_id',
  'indexer_name', 'due_date', 'issue_date', 'bill_date', 'installment_base_date', 'balance_amount',
  'corrected_balance_amount', 'periodicity_type', 'embedded_interest_amount', 'interest_type', 'interest_rate',
  'correction_type', 'interest_base_date', 'defaulter_situation', 'sub_judicie', 'main_unit',
  'installment_number', 'payment_term_id', 'payment_term_description', 'bearer_id',
];

const COLUNAS_CATEGORIA = [
  'bill_id', 'installment_id', 'empresa_id', 'business_type_id', 'business_type_name', 'business_area_id',
  'business_area_name', 'cost_center_id', 'cost_center_name', 'financial_category_id', 'financial_category_name',
  'financial_category_reducer', 'financial_category_type', 'financial_category_rate', 'project_id', 'project_name',
];

const COLUNAS_RECEBIMENTO = [
  'bill_id', 'installment_id', 'empresa_id', 'operation_type_id', 'operation_type_name', 'gross_amount',
  'monetary_correction_amount', 'interest_amount', 'fine_amount', 'discount_amount', 'tax_amount', 'net_amount',
  'addition_amount', 'insurance_amount', 'due_adm_amount', 'calculation_date', 'payment_date', 'credit_date',
  'account_company_id', 'account_number', 'account_type', 'sequencial_number', 'indexer_id',
  'embedded_interest_amount', 'pro_rata',
];

const COLUNAS_MOVIMENTO = [
  'recebimento_id', 'bank_movement_id', 'bank_movement_date', 'sequencial_number', 'amount', 'historic_id',
  'historic_name', 'operation_id', 'operation_name', 'operation_type', 'reconcile', 'corrected_amount', 'origin_id',
];

const COLUNAS_CATEGORIA_MOVIMENTO = [
  'movimento_id', 'business_type_id', 'business_type_name', 'business_area_id', 'business_area_name',
  'cost_center_id', 'cost_center_name', 'financial_category_id', 'financial_category_name',
  'financial_category_reducer', 'financial_category_type', 'financial_category_rate', 'project_id', 'project_name',
  'bank_movement_id',
];

function linhaParcela(empresaId, r) {
  return [
    v(r.billId), v(r.installmentId), empresaId, v(r.companyId), v(r.companyName), v(r.businessAreaId),
    v(r.businessAreaName), v(r.projectId), v(r.projectName), v(r.groupCompanyId), v(r.groupCompanyName),
    v(r.holdingId), v(r.holdingName), v(r.subsidiaryId), v(r.subsidiaryName), v(r.businessTypeId),
    v(r.businessTypeName), v(r.clientId), v(r.clientName), v(r.documentIdentificationId),
    v(r.documentIdentificationName), v(r.documentNumber), v(r.documentForecast), v(r.originId),
    v(r.originalAmount), v(r.discountAmount), v(r.taxAmount), v(r.indexerId), v(r.indexerName), v(r.dueDate),
    v(r.issueDate), v(r.billDate), v(r.installmentBaseDate), v(r.balanceAmount), v(r.correctedBalanceAmount),
    v(r.periodicityType), v(r.embeddedInterestAmount), v(r.interestType), v(r.interestRate), v(r.correctionType),
    v(r.interestBaseDate), v(r.defaulterSituation), v(r.subJudicie), v(r.mainUnit), v(r.installmentNumber),
    // Sim, "descrition" — é o nome real do campo devolvido pela API (erro de
    // digitação do próprio Sienge), confirmado testando ao vivo.
    v(r.paymentTerm?.id), v(r.paymentTerm?.descrition), v(r.bearerId),
  ];
}

function linhaCategoria(empresaId, r, cat) {
  return [
    v(r.billId), v(r.installmentId), empresaId, v(cat.businessTypeId), v(cat.businessTypeName),
    v(cat.businessAreaId), v(cat.businessAreaName), v(cat.costCenterId), v(cat.costCenterName),
    v(cat.financialCategoryId), v(cat.financialCategoryName), v(cat.financialCategoryReducer),
    v(cat.financialCategoryType), v(cat.financialCategoryRate), v(cat.projectId), v(cat.projectName),
  ];
}

function linhaRecebimento(empresaId, r, rec) {
  return [
    v(r.billId), v(r.installmentId), empresaId, v(rec.operationTypeId), v(rec.operationTypeName),
    v(rec.grossAmount), v(rec.monetaryCorrectionAmount), v(rec.interestAmount), v(rec.fineAmount),
    v(rec.discountAmount), v(rec.taxAmount), v(rec.netAmount), v(rec.additionAmount), v(rec.insuranceAmount),
    v(rec.dueAdmAmount), v(rec.calculationDate), v(rec.paymentDate), v(rec.creditDate), v(rec.accountCompanyId),
    v(rec.accountNumber), v(rec.accountType), v(rec.sequencialNumber), v(rec.indexerId),
    v(rec.embeddedInterestAmount), v(rec.proRata),
  ];
}

function linhaMovimento(recebimentoId, mov) {
  return [
    recebimentoId, v(mov.id), v(mov.bankMovementDate), v(mov.sequencialNumber), v(mov.amount), v(mov.historicId),
    v(mov.historicName), v(mov.operationId), v(mov.operationName), v(mov.operationType), v(mov.reconcile),
    v(mov.correctedAmount), v(mov.originId),
  ];
}

function linhaCategoriaMovimento(movimentoId, catMov) {
  return [
    movimentoId, v(catMov.businessTypeId), v(catMov.businessTypeName), v(catMov.businessAreaId),
    v(catMov.businessAreaName), v(catMov.costCenterId), v(catMov.costCenterName), v(catMov.financialCategoryId),
    v(catMov.financialCategoryName), v(catMov.financialCategoryReducer), v(catMov.financialCategoryType),
    v(catMov.financialCategoryRate), v(catMov.projectId), v(catMov.projectName), v(catMov.bankMovementId),
  ];
}

// Busca tudo da API (um tenant devolve tudo de uma vez só — a bulk-data do
// Sienge ignora offset/limit na prática, ver income-api.client.js) e
// substitui inteiro o que já estava salvo da empresa (apaga + reinsere,
// mesmo critério do sie_sales_contracts) dentro de uma única transação.
//
// A ligação pai/filho (recebimento -> movimentos -> categorias do
// movimento) é resolvida em memória por índice de lista, na ordem em que
// cada nível é achatado — e só vira id de banco de verdade depois que o
// INSERT em lote daquele nível volta com o RETURNING id, na mesma ordem.
async function sincronizar(empresaId, onProgress) {
  const integracao = await getIntegracaoAtiva(empresaId);
  if (!integracao) {
    const e = new Error('Esta empresa não possui uma integração com o Sienge ativa configurada.');
    e.status = 400;
    e.expose = true;
    throw e;
  }

  const password = decrypt(integracao.password_enc);
  const registros = await fetchAllIncome({
    tenant: integracao.tenant,
    username: integracao.username,
    password,
    onProgress,
  });

  const linhasParcelas = [];
  const linhasCategorias = [];
  // Cada item guarda a linha pronta pro INSERT de recebimento + os
  // bankMovements brutos daquele recebimento, pra processar assim que
  // soubermos o id gerado (mesmo índice da linha correspondente).
  const recebimentosBrutos = [];

  for (const r of registros) {
    linhasParcelas.push(linhaParcela(empresaId, r));
    for (const cat of r.receiptsCategories || []) linhasCategorias.push(linhaCategoria(empresaId, r, cat));
    for (const rec of r.receipts || []) {
      recebimentosBrutos.push({ linha: linhaRecebimento(empresaId, r, rec), bankMovements: rec.bankMovements || [] });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM sie_income WHERE empresa_id = $1', [empresaId]);

    await inserirEmLotes(client, 'sie_income', COLUNAS_PARCELA, linhasParcelas);
    await inserirEmLotes(client, 'sie_income_categorias', COLUNAS_CATEGORIA, linhasCategorias);

    const idsRecebimentos = await inserirEmLotes(
      client,
      'sie_income_recebimentos',
      COLUNAS_RECEBIMENTO,
      recebimentosBrutos.map((item) => item.linha),
      { retornarId: true }
    );

    const movimentosBrutos = [];
    recebimentosBrutos.forEach((item, i) => {
      const recebimentoId = idsRecebimentos[i];
      item.bankMovements.forEach((mov) => {
        movimentosBrutos.push({
          linha: linhaMovimento(recebimentoId, mov),
          financialCategories: mov.financialCategories || [],
        });
      });
    });

    const idsMovimentos = await inserirEmLotes(
      client,
      'sie_income_recebimentos_movimentos',
      COLUNAS_MOVIMENTO,
      movimentosBrutos.map((item) => item.linha),
      { retornarId: true }
    );

    const linhasCategoriasMovimento = [];
    movimentosBrutos.forEach((item, i) => {
      const movimentoId = idsMovimentos[i];
      item.financialCategories.forEach((catMov) => {
        linhasCategoriasMovimento.push(linhaCategoriaMovimento(movimentoId, catMov));
      });
    });

    await inserirEmLotes(
      client,
      'sie_income_recebimentos_movimentos_categorias',
      COLUNAS_CATEGORIA_MOVIMENTO,
      linhasCategoriasMovimento
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { total_importado: registros.length };
}

async function getResumo(empresaId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total_parcelas, MAX(atualizado_em) AS ultima_sincronizacao
     FROM sie_income WHERE empresa_id = $1`,
    [empresaId]
  );
  return rows[0];
}

module.exports = { sincronizar, getResumo };
