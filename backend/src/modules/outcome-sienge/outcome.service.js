const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const { fetchAllOutcome } = require('./outcome-api.client');
// (Sincroniza o contas a pagar do Sienge — mesmo padrão do income.service.js: uma chamada HTTP só,
// apaga e reinsere tudo da empresa numa transação, em lotes multi-linha.)

async function getIntegracaoAtiva(empresaId) {
  const { rows } = await pool.query(
    'SELECT tenant, username, password_enc FROM integracoes_sienge WHERE empresa_id = $1 AND ativo = TRUE LIMIT 1',
    [empresaId]
  );
  return rows[0] || null;
}

// undefined quebraria o driver do Postgres — tudo que vai pro banco passa por aqui.
function v(valor) {
  return valor === undefined ? null : valor;
}

// Margem de segurança abaixo do limite real do Postgres (65535 parâmetros por query).
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

// Insere em lotes (ver income.service.js::inserirEmLotes). Com `retornarId`, devolve os ids
// gerados na mesma ordem de `linhas`.
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
  'holding_name', 'subsidiary_id', 'subsidiary_name', 'business_type_id', 'business_type_name', 'creditor_id',
  'creditor_name', 'document_identification_id', 'document_identification_name', 'document_number',
  'forecast_document', 'consistency_status', 'origin_id', 'original_amount', 'discount_amount', 'tax_amount',
  'indexer_id', 'indexer_name', 'due_date', 'issue_date', 'installment_base_date', 'balance_amount',
  'corrected_balance_amount', 'authorization_status', 'bill_date', 'registered_user_id', 'registered_by',
  'registered_date',
];

const COLUNAS_CATEGORIA = [
  'bill_id', 'installment_id', 'empresa_id', 'cost_center_id', 'cost_center_name', 'project_id', 'project_name',
  'financial_category_id', 'financial_category_name', 'financial_category_reducer', 'financial_category_type',
  'financial_category_rate',
];

const COLUNAS_DEPARTAMENTO = ['bill_id', 'installment_id', 'empresa_id', 'departament_id', 'departament_name', 'rate'];

const COLUNAS_OBRA = [
  'bill_id', 'installment_id', 'empresa_id', 'building_id', 'building_name', 'building_unit_id',
  'building_unit_name', 'cost_estimation_sheet_id', 'cost_estimation_sheet_name', 'rate',
];

const COLUNAS_PAGAMENTO = [
  'bill_id', 'installment_id', 'empresa_id', 'operation_type_id', 'operation_type_name', 'gross_amount',
  'monetary_correction_amount', 'interest_amount', 'fine_amount', 'discount_amount', 'tax_amount', 'net_amount',
  'calculation_date', 'payment_date', 'sequencial_number', 'corrected_net_amount', 'payment_authentication',
];

const COLUNAS_MOVIMENTO = [
  'pagamento_id', 'account_company_id', 'account_number', 'account_type', 'bank_movement_date',
  'sequencial_number', 'bank_movement_id', 'amount', 'historic_id', 'historic_name', 'operation_id',
  'operation_name', 'operation_type', 'reconcile', 'origin_id',
];

const COLUNAS_CATEGORIA_MOVIMENTO = [
  'movimento_id', 'cost_center_id', 'cost_center_name', 'financial_category_id', 'financial_category_name',
  'financial_category_reducer', 'financial_category_type', 'financial_category_rate', 'bank_movement_id',
];

const COLUNAS_AUTORIZACAO = [
  'bill_id', 'installment_id', 'empresa_id', 'authorization_user_id', 'authorization_user_name',
  'authorization_date', 'is_last_to_authorize',
];

function linhaParcela(empresaId, r) {
  return [
    v(r.billId), v(r.installmentId), empresaId, v(r.companyId), v(r.companyName), v(r.businessAreaId),
    v(r.businessAreaName), v(r.projectId), v(r.projectName), v(r.groupCompanyId), v(r.groupCompanyName),
    v(r.holdingId), v(r.holdingName), v(r.subsidiaryId), v(r.subsidiaryName), v(r.businessTypeId),
    v(r.businessTypeName), v(r.creditorId), v(r.creditorName), v(r.documentIdentificationId),
    v(r.documentIdentificationName), v(r.documentNumber), v(r.forecastDocument), v(r.consistencyStatus),
    v(r.originId), v(r.originalAmount), v(r.discountAmount), v(r.taxAmount), v(r.indexerId), v(r.indexerName),
    v(r.dueDate), v(r.issueDate), v(r.installmentBaseDate), v(r.balanceAmount), v(r.correctedBalanceAmount),
    v(r.authorizationStatus), v(r.billDate), v(r.registeredUserId), v(r.registeredBy), v(r.registeredDate),
  ];
}

function linhaCategoria(empresaId, r, cat) {
  return [
    v(r.billId), v(r.installmentId), empresaId, v(cat.costCenterId), v(cat.costCenterName), v(cat.projectId),
    v(cat.projectName), v(cat.financialCategoryId), v(cat.financialCategoryName), v(cat.financialCategoryReducer),
    v(cat.financialCategoryType), v(cat.financialCategoryRate),
  ];
}

function linhaDepartamento(empresaId, r, dep) {
  return [v(r.billId), v(r.installmentId), empresaId, v(dep.id), v(dep.name), v(dep.rate)];
}

function linhaObra(empresaId, r, obra) {
  return [
    v(r.billId), v(r.installmentId), empresaId, v(obra.buildingId), v(obra.buildingName), v(obra.buildingUnitId),
    v(obra.buildingUnitName), v(obra.costEstimationSheetId), v(obra.costEstimationSheetName), v(obra.rate),
  ];
}

function linhaPagamento(empresaId, r, pag) {
  return [
    v(r.billId), v(r.installmentId), empresaId, v(pag.operationTypeId), v(pag.operationTypeName),
    v(pag.grossAmount), v(pag.monetaryCorrectionAmount), v(pag.interestAmount), v(pag.fineAmount),
    v(pag.discountAmount), v(pag.taxAmount), v(pag.netAmount), v(pag.calculationDate), v(pag.paymentDate),
    v(pag.sequencialNumber), v(pag.correctedNetAmount), v(pag.paymentAuthentication),
  ];
}

function linhaMovimento(pagamentoId, mov) {
  return [
    pagamentoId, v(mov.accountCompanyId), v(mov.accountNumber), v(mov.accountType), v(mov.bankMovementDate),
    v(mov.sequencialNumber), v(mov.id), v(mov.amount), v(mov.historicId), v(mov.historicName), v(mov.operationId),
    v(mov.operationName), v(mov.operationType), v(mov.reconcile), v(mov.originId),
  ];
}

function linhaCategoriaMovimento(movimentoId, catMov) {
  return [
    movimentoId, v(catMov.costCenterId), v(catMov.costCenterName), v(catMov.financialCategoryId),
    v(catMov.financialCategoryName), v(catMov.financialCategoryReducer), v(catMov.financialCategoryType),
    v(catMov.financialCategoryRate), v(catMov.bankMovementId),
  ];
}

function linhaAutorizacao(empresaId, r, aut) {
  return [
    v(r.billId), v(r.installmentId), empresaId, v(aut.authorizationUserId), v(aut.authorizationUserName),
    v(aut.authorizationDate), v(aut.isLastToAuthorize),
  ];
}

// Substitui inteiro o que estava salvo da empresa pelos `registros` da API (apaga + reinsere numa
// transação só). A ligação pai/filho (pagamento -> movimentos -> categorias do movimento) é
// resolvida por índice de lista, como no income.
async function gravar(empresaId, registros) {
  const linhasParcelas = [];
  const linhasCategorias = [];
  const linhasDepartamentos = [];
  const linhasObras = [];
  const linhasAutorizacoes = [];
  const pagamentosBrutos = [];

  for (const r of registros) {
    linhasParcelas.push(linhaParcela(empresaId, r));
    for (const cat of r.paymentsCategories || []) linhasCategorias.push(linhaCategoria(empresaId, r, cat));
    for (const dep of r.departamentsCosts || []) linhasDepartamentos.push(linhaDepartamento(empresaId, r, dep));
    for (const obra of r.buildingsCosts || []) linhasObras.push(linhaObra(empresaId, r, obra));
    for (const aut of r.authorizations || []) linhasAutorizacoes.push(linhaAutorizacao(empresaId, r, aut));
    for (const pag of r.payments || []) {
      pagamentosBrutos.push({ linha: linhaPagamento(empresaId, r, pag), bankMovements: pag.bankMovements || [] });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM sie_outcome WHERE empresa_id = $1', [empresaId]);

    await inserirEmLotes(client, 'sie_outcome', COLUNAS_PARCELA, linhasParcelas);
    await inserirEmLotes(client, 'sie_outcome_categorias', COLUNAS_CATEGORIA, linhasCategorias);
    await inserirEmLotes(client, 'sie_outcome_departamentos', COLUNAS_DEPARTAMENTO, linhasDepartamentos);
    await inserirEmLotes(client, 'sie_outcome_obras', COLUNAS_OBRA, linhasObras);
    await inserirEmLotes(client, 'sie_outcome_autorizacoes', COLUNAS_AUTORIZACAO, linhasAutorizacoes);

    const idsPagamentos = await inserirEmLotes(
      client,
      'sie_outcome_pagamentos',
      COLUNAS_PAGAMENTO,
      pagamentosBrutos.map((item) => item.linha),
      { retornarId: true }
    );

    const movimentosBrutos = [];
    pagamentosBrutos.forEach((item, i) => {
      const pagamentoId = idsPagamentos[i];
      item.bankMovements.forEach((mov) => {
        movimentosBrutos.push({
          linha: linhaMovimento(pagamentoId, mov),
          paymentCategories: mov.paymentCategories || [],
        });
      });
    });

    const idsMovimentos = await inserirEmLotes(
      client,
      'sie_outcome_pagamentos_movimentos',
      COLUNAS_MOVIMENTO,
      movimentosBrutos.map((item) => item.linha),
      { retornarId: true }
    );

    const linhasCategoriasMovimento = [];
    movimentosBrutos.forEach((item, i) => {
      const movimentoId = idsMovimentos[i];
      item.paymentCategories.forEach((catMov) => {
        linhasCategoriasMovimento.push(linhaCategoriaMovimento(movimentoId, catMov));
      });
    });

    await inserirEmLotes(
      client,
      'sie_outcome_pagamentos_movimentos_categorias',
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

// Busca tudo da API (uma chamada só) e grava.
async function sincronizar(empresaId, onProgress) {
  const integracao = await getIntegracaoAtiva(empresaId);
  if (!integracao) {
    const e = new Error('Esta empresa não possui uma integração com o Sienge ativa configurada.');
    e.status = 400;
    e.expose = true;
    throw e;
  }

  const password = decrypt(integracao.password_enc);
  const registros = await fetchAllOutcome({
    tenant: integracao.tenant,
    username: integracao.username,
    password,
    onProgress,
  });

  return gravar(empresaId, registros);
}

async function getResumo(empresaId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total_parcelas, MAX(atualizado_em) AS ultima_sincronizacao
     FROM sie_outcome WHERE empresa_id = $1`,
    [empresaId]
  );
  return rows[0];
}

module.exports = { sincronizar, gravar, getResumo };
