const fs = require('fs');
const path = require('path');
const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const construtorVendasService = require('../integracoes-construtor-vendas/construtorVendas.service');
const cvcrmApi = require('../integracoes-construtor-vendas/cvcrm-api.client');
const siengeContractsApi = require('./sienge-contracts-api.client');
const progresso = require('./progressoSincronizacao');

// Centros de custo da empresa que já têm a etapa "Lançamento" (Histórico de
// Etapas, máscara ETAPAS_CENTRO_CUSTO) com data de início informada E já
// alcançada (data_inicio <= hoje) — um lançamento com data futura ainda não
// começou, então o centro continua fora do filtro (e do Kanban, que reusa
// esta mesma lista como elegibilidade) até o dia chegar. Mesmo critério
// usado no filtro de Curva de Vendas/Obras (ver
// backend/src/modules/curva-vendas/curva.service.js).
async function listCentrosComLancamento(empresaId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT c.sienge_id, c.name
     FROM centros_custo_sienge c
     JOIN centro_custo_etapas_historico h
       ON h.sienge_id = c.sienge_id AND h.empresa_id = c.empresa_id
       AND h.data_inicio IS NOT NULL AND h.data_inicio <= CURRENT_DATE
     JOIN mascara_itens m
       ON m.id = h.mascara_item_id AND m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.descricao = 'Lançamento'
     WHERE c.empresa_id = $1
     ORDER BY c.name ASC`,
    [empresaId]
  );
  return rows;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// A API manda "" (string vazia) em vários campos opcionais, e datas
// inválidas como sentinela "0000-00-00" / "0000-00-00 00:00:00" — nenhum
// dos dois pode virar um NUMERIC/TIMESTAMP direto, então tudo isso vira
// NULL de verdade.
function vazioParaNulo(valor) {
  if (valor === '' || valor === undefined) return null;
  if (typeof valor === 'string' && /^0000-00-00([ T]00:00:00)?$/.test(valor.trim())) return null;
  return valor;
}

// Campos do endpoint /cvdw/reservas, já achatado (1 registro = 1 reserva,
// sem objetos aninhados) — mapeados 1:1 pro nome da coluna, que é o mesmo
// nome que a API usa. `campos_adicionais`/`campos_adicionais_contrato` são
// ignorados de propósito (mesmo critério do script de referência).
const CAMPOS_RESERVA = [
  'referencia', 'referencia_data', 'ativo', 'data_cad', 'codigointerno', 'numero_venda',
  'aprovada', 'data_venda', 'situacao', 'idsituacao', 'situacao_comercial', 'idempreendimento',
  'codigointerno_empreendimento', 'empreendimento', 'data_entrega_chaves_contrato_cliente', 'etapa',
  'bloco', 'unidade', 'regiao', 'venda', 'idcliente', 'documento_cliente', 'cliente', 'email', 'cidade',
  'cep_cliente', 'renda', 'sexo', 'idade', 'estado_civil', 'idcorretor', 'corretor', 'idimobiliaria',
  'imobiliaria', 'valor_contrato', 'valor_contrato_com_juros', 'vencimento', 'campanha', 'cessao',
  'motivo_cancelamento', 'data_cancelamento', 'espacos_complementares', 'idlead',
  'data_ultima_alteracao_situacao', 'idempresa_correspondente', 'empresa_correspondente', 'valor_fgts',
  'valor_financiamento', 'valor_subsidio', 'nome_usuario', 'idunidade', 'idprecadastro', 'idmidia', 'midia',
  'descricao_motivo_cancelamento', 'idsituacao_anterior', 'situacao_anterior', 'idtabela', 'nometabela',
  'codigointernotabela', 'idtipo_tabela', 'tipo_tabela', 'data_contrato', 'valor_proposta', 'vpl_reserva',
  'valor_liquido_com_juros', 'valor_liquido_sem_juros', 'vgv_tabela', 'vpl_tabela', 'usuario_aprovacao',
  'data_aprovacao', 'juros_condicao_aprovada', 'juros_apos_entrega_condicao_aprovada',
  'idtabela_condicao_aprovada', 'data_primeira_aprovacao', 'aprovacao_absoluto', 'aprovacao_vpl_valor',
  'idtipovenda', 'tipovenda', 'idgrupo', 'grupo', 'data_modificacao', 'idgestor_time', 'nome_time',
  'juros_apos_entrega_cadastro', 'juros_cadastro_fixa_adicional', 'juros_cadastro', 'data_entrega',
  'idtipo_reserva', 'tipo_reserva', 'vgv_tabela_minima', 'vpl_tabela_minima', 'idtime',
];

const COLUNAS_RESERVA = ['empresa_id', 'idreserva', ...CAMPOS_RESERVA];

function extrairCamposReserva(reg) {
  const campos = { idreserva: vazioParaNulo(reg?.idreserva) };
  for (const nome of CAMPOS_RESERVA) {
    campos[nome] = vazioParaNulo(reg?.[nome]);
  }
  return campos;
}

async function inserirReserva(client, empresaId, campos) {
  const valores = [empresaId, ...COLUNAS_RESERVA.slice(1).map((col) => campos[col])];
  const placeholders = valores.map((_, i) => `$${i + 1}`).join(', ');
  await client.query(
    `INSERT INTO construtor_vendas_reservas (${COLUNAS_RESERVA.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (empresa_id, idreserva) DO NOTHING`,
    valores
  );
}

// Puxa TODAS as reservas da API do Construtor de Vendas (CVCRM) pra essa
// empresa e substitui completamente o que já estava salvo — apaga tudo e
// reinsere, pra nunca duplicar.
async function sincronizarReservas(empresaId) {
  const credenciais = await construtorVendasService.getCredenciaisAtivas(empresaId);
  if (!credenciais) {
    throw badRequest('Esta empresa não possui uma integração Construtor de Vendas ativa configurada.');
  }

  const token = decrypt(credenciais.senha_enc);
  try {
    const registros = await cvcrmApi.fetchAllReservas({
      tenant: credenciais.tenant,
      email: credenciais.email,
      token,
      onProgress: (p) => progresso.set(empresaId, 'cvcrm', p),
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM construtor_vendas_reservas WHERE empresa_id = $1', [empresaId]);

      for (const reg of registros) {
        if (!reg || reg.idreserva === undefined || reg.idreserva === null) continue;
        const campos = extrairCamposReserva(reg);
        await inserirReserva(client, empresaId, campos);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return { total_importado: registros.length };
  } finally {
    progresso.clear(empresaId, 'cvcrm');
  }
}

async function getCredenciaisSiengeAtivas(empresaId) {
  const { rows } = await pool.query(
    'SELECT tenant, username, password_enc FROM integracoes_sienge WHERE empresa_id = $1 AND ativo = TRUE',
    [empresaId]
  );
  return rows[0] || null;
}

// Campos do contrato (endpoint /sales-contracts do Sienge), achatados,
// mapeando o camelCase da API pro snake_case da coluna.
const CAMPOS_CONTRATO = [
  ['company_id', 'companyId'], ['internal_company_id', 'internalCompanyId'],
  ['company_name', 'companyName'], ['enterprise_id', 'enterpriseId'],
  ['internal_enterprise_id', 'internalEnterpriseId'], ['enterprise_name', 'enterpriseName'],
  ['receivable_bill_id', 'receivableBillId'], ['cancellation_payable_bill_id', 'cancellationPayableBillId'],
  ['contract_date', 'contractDate'], ['issue_date', 'issueDate'], ['accounting_date', 'accountingDate'],
  ['expected_delivery_date', 'expectedDeliveryDate'], ['keys_delivered_at', 'keysDeliveredAt'],
  ['number', 'number'], ['external_id', 'externalId'], ['correction_type', 'correctionType'],
  ['situation', 'situation'], ['discount_type', 'discountType'], ['discount_percentage', 'discountPercentage'],
  ['value', 'value'], ['total_selling_value', 'totalSellingValue'], ['cancellation_date', 'cancellationDate'],
  ['total_cancellation_amount', 'totalCancellationAmount'], ['cancellation_reason', 'cancellationReason'],
  ['financial_institution_number', 'financialInstitutionNumber'],
  ['financial_institution_date', 'financialInstitutionDate'], ['pro_rata_indexer', 'proRataIndexer'],
  ['interest_type', 'interestType'], ['interest_percentage', 'interestPercentage'],
  ['fine_rate', 'fineRate'], ['late_interest_calculation_type', 'lateInterestCalculationType'],
  ['daily_late_interest_value', 'dailyLateInterestValue'],
  ['contains_remade_installments', 'containsRemadeInstallments'], ['special_clause', 'specialClause'],
];

const COLUNAS_CONTRATO = ['sienge_contract_id', 'empresa_id', ...CAMPOS_CONTRATO.map(([col]) => col)];

async function inserirContrato(client, empresaId, reg) {
  const valores = [
    vazioParaNulo(reg.id),
    empresaId,
    ...CAMPOS_CONTRATO.map(([, campoApi]) => vazioParaNulo(reg[campoApi])),
  ];
  const placeholders = valores.map((_, i) => `$${i + 1}`).join(', ');
  await client.query(
    `INSERT INTO sie_sales_contracts (${COLUNAS_CONTRATO.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (sienge_contract_id, empresa_id) DO NOTHING`,
    valores
  );

  let clientes = reg.salesContractCustomers;
  if (clientes && !Array.isArray(clientes)) clientes = [clientes];
  for (const c of Array.isArray(clientes) ? clientes : []) {
    if (!c) continue;
    await client.query(
      `INSERT INTO sie_sales_contracts_customers
         (sienge_contract_id, empresa_id, customer_id, name, main, spouse, participation_percentage)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        vazioParaNulo(reg.id),
        empresaId,
        vazioParaNulo(c.id),
        vazioParaNulo(c.name),
        vazioParaNulo(c.main),
        vazioParaNulo(c.spouse),
        vazioParaNulo(c.participationPercentage),
      ]
    );
  }
}

// Puxa TODOS os contratos da API do Sienge (/sales-contracts) pra essa
// empresa e substitui completamente o que já estava salvo — mesmo critério
// de sincronizarReservas: apaga tudo (o CASCADE já limpa os compradores) e
// reinsere, pra nunca duplicar.
async function sincronizarContratos(empresaId) {
  const credenciais = await getCredenciaisSiengeAtivas(empresaId);
  if (!credenciais) {
    throw badRequest('Esta empresa não possui uma integração Sienge ativa configurada.');
  }

  const password = decrypt(credenciais.password_enc);
  try {
    const registros = await siengeContractsApi.fetchAllContracts({
      tenant: credenciais.tenant,
      username: credenciais.username,
      password,
      onProgress: (p) => progresso.set(empresaId, 'sienge', p),
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM sie_sales_contracts WHERE empresa_id = $1', [empresaId]);

      for (const reg of registros) {
        if (!reg || reg.id === undefined || reg.id === null) continue;
        await inserirContrato(client, empresaId, reg);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return { total_importado: registros.length };
  } finally {
    progresso.clear(empresaId, 'sienge');
  }
}

// Edição pontual feita pelo usuário direto no card do bucket Contrato — só
// grava o campo `financialInstitutionNumber` (número da instituição
// financeira/CEF) na API do Sienge, sem reenviar o resto do contrato.
// Depois de confirmado na API, replica o valor na cópia local (sem esperar
// a próxima sincronização completa), pra já refletir na tela.
async function atualizarNumeroInstituicaoFinanceira(empresaId, siengeContractId, numeroInstituicaoFinanceira) {
  const credenciais = await getCredenciaisSiengeAtivas(empresaId);
  if (!credenciais) {
    throw badRequest('Esta empresa não possui uma integração Sienge ativa configurada.');
  }

  const { rows } = await pool.query(
    'SELECT 1 FROM sie_sales_contracts WHERE empresa_id = $1 AND sienge_contract_id = $2',
    [empresaId, siengeContractId]
  );
  if (rows.length === 0) {
    throw badRequest('Contrato não encontrado para essa empresa.');
  }

  const password = decrypt(credenciais.password_enc);
  await siengeContractsApi.updateContract({
    tenant: credenciais.tenant,
    username: credenciais.username,
    password,
    contractId: siengeContractId,
    body: { financialInstitutionNumber: numeroInstituicaoFinanceira },
  });

  await pool.query(
    'UPDATE sie_sales_contracts SET financial_institution_number = $1 WHERE empresa_id = $2 AND sienge_contract_id = $3',
    [numeroInstituicaoFinanceira, empresaId, siengeContractId]
  );

  return { numero_instituicao_financeira: numeroInstituicaoFinanceira };
}

// Lista os contratos pro bucket "Contrato" do Kanban — cliente principal é
// o comprador marcado como `main = TRUE` em sie_sales_contracts_customers.
// Filtro de Centro de Custo: diferente das reservas (que vêm do CVCRM e
// precisam de um código de ligação manual), aqui os dois lados já vêm do
// Sienge — centros_custo_sienge.sienge_id É o enterprise_id do contrato,
// sem indireção nenhuma. Sem nenhum centro selecionado, mostra todos os
// contratos da empresa.
// SQL do LEFT JOIN LATERAL que traz a última micro etapa registrada
// manualmente (ver registrarMovimentacaoMicroEtapa) pra cada linha das
// listagens de bucket — usado nos cards do Kanban (não no modal de
// histórico, que já busca isso via listMicroEtapasPorReserva). Recebe os
// nomes das colunas de empresa_id/idreserva já disponíveis na query
// principal nesse ponto do FROM (podem vir de uma LATERAL anterior, como
// `res.idreserva`) — por isso é interpolado como texto, não parametrizado.
function ULTIMA_MICROETAPA_LATERAL(colEmpresaId, colIdreserva) {
  return `LEFT JOIN LATERAL (
       SELECT m.id AS mascara_item_id, m.descricao AS nome, h.data_movimentacao AS data
       FROM repasses_cef_historico_microetapas h
       JOIN mascara_itens m ON m.id = h.mascara_item_id
       WHERE h.empresa_id = ${colEmpresaId} AND h.idreserva = ${colIdreserva}
       ORDER BY h.data_movimentacao DESC, h.id DESC
       LIMIT 1
     ) um ON TRUE`;
}

async function listContratos(empresaId, centroCustoIds = []) {
  const condicoes = ['c.empresa_id = $1'];
  const params = [empresaId];

  // Só entram contratos de centros de custo que aparecem no próprio filtro
  // de Centro de Custo (mesmo critério do listCentrosComLancamento: já
  // passaram pela etapa "Lançamento") — mesmo sem nenhum selecionado, nunca
  // mostra contratos de centros que nem aparecem pra escolher no filtro.
  // `centroCustoIds` (quando preenchido) restringe mais ainda, só aos
  // centros escolhidos.
  const centrosDoFiltro = await listCentrosComLancamento(empresaId);
  const idsDoFiltro = centrosDoFiltro.map((c) => c.sienge_id);
  const temFiltroSelecionado = Array.isArray(centroCustoIds) && centroCustoIds.length > 0;
  const idsPermitidos = temFiltroSelecionado
    ? idsDoFiltro.filter((id) => centroCustoIds.includes(id))
    : idsDoFiltro;

  params.push(idsPermitidos.length > 0 ? idsPermitidos : [-1]);
  condicoes.push(`c.enterprise_id = ANY($${params.length}::bigint[])`);

  // O Kanban representa a etapa atual do cliente — um contrato que já virou
  // unidade em extrato_unidades (achado pela mesma ligação usada em
  // listUnidadesExtrato: financial_institution_number = numero_contrato_unidade)
  // não aparece mais aqui, só em Assinatura ou Registro. Sobra em Contrato
  // só quem ainda não tem essa unidade.
  condicoes.push(`NOT EXISTS (
    SELECT 1 FROM extrato_unidades u
    WHERE u.empresa_id = c.empresa_id
      AND u.numero_contrato_unidade = c.financial_institution_number
  )`);

  // Filtros "Tipo de Venda" e "Situação da Reserva" (os mesmos configurados
  // em "Configurar Filtros de Visualização" pro bucket Reserva) também se
  // aplicam ao bucket Contrato — via uma ligação indireta: quando `number`
  // começa com "CV", o `external_id` do contrato é o `idreserva` da reserva
  // de origem. Contratos que não começam com "CV" ou cujo `external_id` não
  // bate com nenhuma reserva ficam de fora sempre que algum dos dois
  // filtros tiver algo selecionado — nunca aparecem como "Não informado"
  // (só reserva com tipovenda NULL entra nessa opção; situação nunca tem
  // essa opção).
  const filtro = await getFiltrosReserva(empresaId);
  if (filtro.tipovenda.length > 0) {
    const valoresReais = filtro.tipovenda.filter((v) => v !== '');
    const incluiNaoInformado = filtro.tipovenda.includes('');
    const partes = [];
    if (valoresReais.length > 0) {
      params.push(valoresReais);
      partes.push(`res.tipovenda = ANY($${params.length}::text[])`);
    }
    if (incluiNaoInformado) partes.push('res.tipovenda IS NULL');
    condicoes.push(`res.idreserva IS NOT NULL AND (${partes.join(' OR ')})`);
  }

  if (filtro.situacao.length > 0) {
    params.push(filtro.situacao);
    condicoes.push(`res.idreserva IS NOT NULL AND res.situacao = ANY($${params.length}::text[])`);
  }

  const { rows } = await pool.query(
    `SELECT c.sienge_contract_id, c.enterprise_name AS empreendimento, c.number,
            c.value AS valor, c.contract_date, c.criado_em,
            c.financial_institution_number AS numero_instituicao_financeira,
            COALESCE(res.cliente, cli.name) AS titular_nome,
            res.idreserva, res.tipovenda, res.situacao,
            um.nome AS ultima_microetapa_nome, um.data AS ultima_microetapa_data,
            um.mascara_item_id AS ultima_microetapa_id
     FROM sie_sales_contracts c
     -- Só um fallback pra quando o contrato não linka com nenhuma reserva
     -- CVCRM (res.cliente abaixo é a fonte preferida — ver comentário na
     -- lateral de res). Num contrato de casal, onde os dois compradores vêm
     -- main=true no Sienge, esse desempate (id mais baixo) é arbitrário e é
     -- exatamente por isso que res.cliente vem primeiro no COALESCE.
     LEFT JOIN LATERAL (
       SELECT name FROM sie_sales_contracts_customers
       WHERE sienge_contract_id = c.sienge_contract_id AND empresa_id = c.empresa_id
       ORDER BY main DESC NULLS LAST, id ASC
       LIMIT 1
     ) cli ON TRUE
     LEFT JOIN LATERAL (
       SELECT r.idreserva, r.tipovenda, r.situacao, r.cliente
       FROM construtor_vendas_reservas r
       WHERE r.empresa_id = c.empresa_id
         AND c.number LIKE 'CV%'
         AND c.external_id ~ '^[0-9]+$'
         AND r.idreserva = c.external_id::int
       LIMIT 1
     ) res ON TRUE
     ${ULTIMA_MICROETAPA_LATERAL('c.empresa_id', 'res.idreserva')}
     WHERE ${condicoes.join(' AND ')}
     ORDER BY c.contract_date ASC NULLS LAST, c.sienge_contract_id ASC`,
    params
  );
  return rows;
}

// Opções pra popular os checklists de "Configurar Filtros de Visualização"
// do bucket Reserva — valores distintos que já existem na tabela. Em
// tipovenda, o NULL vira a opção especial '' ("Não informado").
async function listOpcoesFiltroReserva(empresaId) {
  const { rows: tvRows } = await pool.query(
    'SELECT DISTINCT tipovenda FROM construtor_vendas_reservas WHERE empresa_id = $1 ORDER BY tipovenda NULLS FIRST',
    [empresaId]
  );
  const tipovenda = tvRows.map((r) => ({
    value: r.tipovenda ?? '',
    label: r.tipovenda ?? 'Não informado',
  }));

  const { rows: sitRows } = await pool.query(
    'SELECT DISTINCT situacao FROM construtor_vendas_reservas WHERE empresa_id = $1 AND situacao IS NOT NULL ORDER BY situacao',
    [empresaId]
  );
  const situacao = sitRows.map((r) => ({ value: r.situacao, label: r.situacao }));

  return { tipovenda, situacao };
}

async function getFiltrosReserva(empresaId) {
  const { rows } = await pool.query(
    'SELECT tipovenda, situacao FROM repasses_cef_filtros_reserva WHERE empresa_id = $1',
    [empresaId]
  );
  return rows[0] || { tipovenda: [], situacao: [] };
}

async function salvarFiltrosReserva(empresaId, { tipovenda, situacao }) {
  const { rows } = await pool.query(
    `INSERT INTO repasses_cef_filtros_reserva (empresa_id, tipovenda, situacao)
     VALUES ($1, $2, $3)
     ON CONFLICT (empresa_id) DO UPDATE SET tipovenda = $2, situacao = $3, atualizado_em = NOW()
     RETURNING tipovenda, situacao`,
    [empresaId, tipovenda, situacao]
  );
  return rows[0];
}

// Cor escolhida pra cada valor de tipovenda/situação — é ela que aparece no
// badge do card da reserva (ver ReservaCard no frontend).
async function getCoresReserva(empresaId) {
  const { rows } = await pool.query(
    'SELECT campo, valor, cor FROM repasses_cef_cores_reserva WHERE empresa_id = $1',
    [empresaId]
  );
  const cores = { tipovenda: {}, situacao: {} };
  for (const r of rows) {
    if (cores[r.campo]) cores[r.campo][r.valor] = r.cor;
  }
  return cores;
}

async function salvarCoresReserva(empresaId, { tipovenda, situacao }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM repasses_cef_cores_reserva WHERE empresa_id = $1', [empresaId]);

    for (const [campo, mapa] of [
      ['tipovenda', tipovenda || {}],
      ['situacao', situacao || {}],
    ]) {
      for (const [valor, cor] of Object.entries(mapa)) {
        if (!cor) continue;
        await client.query(
          `INSERT INTO repasses_cef_cores_reserva (empresa_id, campo, valor, cor)
           VALUES ($1, $2, $3, $4)`,
          [empresaId, campo, valor, cor]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return getCoresReserva(empresaId);
}

// Só mostra, no bucket Reserva, os cartões que batem com o filtro salvo pra
// essa empresa — array vazio em qualquer dimensão significa "sem filtro
// nessa dimensão" (mostra tudo), EXCETO Centro de Custo: mesmo critério do
// bucket Contrato (ver listContratos) e do próprio filtro combobox — só
// entram reservas de centros de custo que já passaram pela etapa
// "Lançamento" (listCentrosComLancamento) E têm "código Construtor de
// Vendas" configurado. Um centro sem "Lançamento" nunca aparece pra
// escolher no filtro, então uma reserva ligada a ele não pode vazar pro
// kanban só porque o código de ligação está preenchido — sem essa dupla
// checagem, um centro assim aparecia no bucket mesmo fora do seletor.
// `centroCustoIds` (quando preenchido) restringe mais ainda, só aos centros
// escolhidos. A ligação entre os dois sistemas é sempre via
// centros_custo_sienge.codigo_construtor_vendas ↔
// construtor_vendas_reservas.codigointerno_empreendimento — não há FK
// direta entre eles.
async function listReservas(empresaId, centroCustoIds = []) {
  const filtro = await getFiltrosReserva(empresaId);
  const condicoes = ['r.empresa_id = $1'];
  const params = [empresaId];

  const centrosDoFiltro = await listCentrosComLancamento(empresaId);
  const idsDoLancamento = centrosDoFiltro.map((c) => c.sienge_id);
  const temFiltroDeCentro = Array.isArray(centroCustoIds) && centroCustoIds.length > 0;
  const idsPermitidos = temFiltroDeCentro
    ? idsDoLancamento.filter((id) => centroCustoIds.includes(id))
    : idsDoLancamento;

  const { rows: codigoRows } = await pool.query(
    `SELECT DISTINCT codigo_construtor_vendas
     FROM centros_custo_sienge
     WHERE empresa_id = $1 AND sienge_id = ANY($2::int[])
       AND codigo_construtor_vendas IS NOT NULL AND codigo_construtor_vendas != ''`,
    [empresaId, idsPermitidos.length > 0 ? idsPermitidos : [-1]]
  );
  const codigos = codigoRows.map((r) => r.codigo_construtor_vendas);
  // Nenhum código disponível (nem os centros permitidos, nem — no caso sem
  // filtro — nenhum centro "Lançamento" da empresa tem código configurado)
  // — usa uma condição que nunca bate, em vez de deixar passar tudo sem
  // controle.
  params.push(codigos.length > 0 ? codigos : ['__nenhum_codigo_configurado__']);
  condicoes.push(`r.codigointerno_empreendimento = ANY($${params.length}::text[])`);

  if (filtro.tipovenda.length > 0) {
    const valoresReais = filtro.tipovenda.filter((v) => v !== '');
    const incluiNaoInformado = filtro.tipovenda.includes('');
    const partes = [];
    if (valoresReais.length > 0) {
      params.push(valoresReais);
      partes.push(`r.tipovenda = ANY($${params.length}::text[])`);
    }
    if (incluiNaoInformado) partes.push('r.tipovenda IS NULL');
    condicoes.push(`(${partes.join(' OR ')})`);
  }

  if (filtro.situacao.length > 0) {
    params.push(filtro.situacao);
    condicoes.push(`r.situacao = ANY($${params.length}::text[])`);
  }

  // O Kanban representa a etapa atual do cliente — uma reserva que já virou
  // contrato (achado pela mesma ligação usada em listContratos: contrato
  // com `number` começando com "CV" e `external_id` igual ao idreserva) não
  // aparece mais aqui, só no bucket Contrato. Sobra em Reserva só quem ainda
  // não tem contrato nenhum.
  condicoes.push(`NOT EXISTS (
    SELECT 1 FROM sie_sales_contracts c
    WHERE c.empresa_id = r.empresa_id
      AND c.number LIKE 'CV%'
      AND c.external_id ~ '^[0-9]+$'
      AND c.external_id::int = r.idreserva
  )`);

  // O nome do empreendimento mostrado é sempre o cadastrado no Horizon (o
  // `name` de centros_custo_sienge, ligado via codigo_construtor_vendas ↔
  // codigointerno_empreendimento) — não o nome que vem cru do Construtor de
  // Vendas, que pode divergir. Só cai no nome cru se, por algum motivo, não
  // achar o centro de custo correspondente.
  const { rows } = await pool.query(
    `SELECT r.id, r.idreserva,
            COALESCE(cc.name, r.empreendimento) AS empreendimento, r.unidade,
            r.cliente AS titular_nome, r.valor_contrato AS valor_venda, r.venda AS vendida,
            r.tipovenda, r.situacao, r.data_venda, r.criado_em,
            um.nome AS ultima_microetapa_nome, um.data AS ultima_microetapa_data,
            um.mascara_item_id AS ultima_microetapa_id
     FROM construtor_vendas_reservas r
     LEFT JOIN centros_custo_sienge cc
       ON cc.empresa_id = r.empresa_id AND cc.codigo_construtor_vendas = r.codigointerno_empreendimento
     ${ULTIMA_MICROETAPA_LATERAL('r.empresa_id', 'r.idreserva')}
     WHERE ${condicoes.join(' AND ')}
     ORDER BY r.data_cad ASC NULLS LAST, r.id ASC`,
    params
  );
  return rows;
}

// Lista as unidades assinadas pro bucket "Assinatura" do Kanban — vêm de
// extrato_unidades (importada manualmente na tela Extrato, arquivo da
// Caixa), sem sincronização própria por API. A ligação com Centro de Custo
// é direta: centros_custo_sienge.codigo_contrato_caixa É o
// contrato_empreendimento de extrato_unidades — mesmo critério (corrigido)
// de listReservas/listContratos: só entram unidades de centros que já
// passaram pela etapa "Lançamento" E têm esse código configurado. Sem
// nenhum centro selecionado, vale pra todos os centros "Lançamento" da
// empresa — nunca pra um centro que nem aparece no filtro.
// Base compartilhada entre os buckets "Assinatura" e "Registro" — ambos vêm
// de extrato_unidades, e a etapa é decidida só pela coluna
// data_inclusao_dados_registro_cri: em branco é Assinatura (contrato
// assinado mas ainda não deu entrada no registro do cartório/CRI), com data
// preenchida é Registro (já deu entrada) — nunca aparece nos dois buckets
// ao mesmo tempo.
async function listUnidadesExtrato(empresaId, centroCustoIds, { comRegistro }) {
  const centrosDoFiltro = await listCentrosComLancamento(empresaId);
  const idsDoLancamento = centrosDoFiltro.map((c) => c.sienge_id);
  const temFiltroDeCentro = Array.isArray(centroCustoIds) && centroCustoIds.length > 0;
  const idsPermitidos = temFiltroDeCentro
    ? idsDoLancamento.filter((id) => centroCustoIds.includes(id))
    : idsDoLancamento;

  const { rows: codigoRows } = await pool.query(
    `SELECT DISTINCT codigo_contrato_caixa
     FROM centros_custo_sienge
     WHERE empresa_id = $1 AND sienge_id = ANY($2::int[])
       AND codigo_contrato_caixa IS NOT NULL AND codigo_contrato_caixa != ''`,
    [empresaId, idsPermitidos.length > 0 ? idsPermitidos : [-1]]
  );
  const codigos = codigoRows.map((r) => r.codigo_contrato_caixa);

  // No bucket Assinatura, quem está parado há mais tempo (data de
  // assinatura mais antiga) aparece primeiro — é o que precisa de atenção
  // primeiro. No Registro não há essa urgência, ordena pelo mais recente.
  const ordem = comRegistro
    ? 'u.data_inclusao_dados_registro_cri DESC NULLS LAST'
    : 'u.data_assinatura_contrato ASC NULLS LAST';

  // Liga a unidade ao contrato de origem — mesmo padrão da ligação
  // contrato↔reserva (ver listContratos), só que num degrau diferente:
  // sie_sales_contracts.financial_institution_number é o mesmo valor de
  // extrato_unidades.numero_contrato_unidade. A partir do contrato
  // encontrado, reaproveita a MESMA ligação contrato↔reserva (number
  // começando com "CV" e external_id = idreserva) pra chegar até o
  // tipovenda/situação/cliente da reserva original. Uma unidade que não
  // fecha essa cadeia até uma reserva de verdade (res.idreserva = NULL)
  // "pulou o ciclo normal" e fica de fora dos dois buckets — exigido no
  // WHERE abaixo.
  const { rows } = await pool.query(
    `SELECT u.id, u.contrato_empreendimento, u.numero_contrato_unidade,
            COALESCE(res.cliente, u.nome_mutuario) AS titular_nome, u.data_assinatura_contrato,
            u.data_inclusao_dados_registro_cri AS data_registro,
            COALESCE(cc.name, u.contrato_empreendimento) AS empreendimento,
            ctr.number AS numero_contrato, res.idreserva, res.tipovenda, res.situacao,
            um.nome AS ultima_microetapa_nome, um.data AS ultima_microetapa_data,
            um.mascara_item_id AS ultima_microetapa_id
     FROM extrato_unidades u
     LEFT JOIN centros_custo_sienge cc
       ON cc.empresa_id = u.empresa_id AND cc.codigo_contrato_caixa = u.contrato_empreendimento
     LEFT JOIN LATERAL (
       SELECT c.number, c.external_id
       FROM sie_sales_contracts c
       WHERE c.empresa_id = u.empresa_id AND c.financial_institution_number = u.numero_contrato_unidade
       LIMIT 1
     ) ctr ON TRUE
     LEFT JOIN LATERAL (
       SELECT r.idreserva, r.tipovenda, r.situacao, r.cliente
       FROM construtor_vendas_reservas r
       WHERE r.empresa_id = u.empresa_id
         AND ctr.number LIKE 'CV%'
         AND ctr.external_id ~ '^[0-9]+$'
         AND r.idreserva = ctr.external_id::int
       LIMIT 1
     ) res ON TRUE
     ${ULTIMA_MICROETAPA_LATERAL('u.empresa_id', 'res.idreserva')}
     WHERE u.empresa_id = $1 AND u.contrato_empreendimento = ANY($2::text[])
       AND u.data_inclusao_dados_registro_cri IS ${comRegistro ? 'NOT NULL' : 'NULL'}
       AND res.idreserva IS NOT NULL
     ORDER BY ${ordem}, u.id DESC`,
    [empresaId, codigos.length > 0 ? codigos : ['__nenhum_codigo_configurado__']]
  );
  return rows;
}

async function listAssinaturas(empresaId, centroCustoIds = []) {
  return listUnidadesExtrato(empresaId, centroCustoIds, { comRegistro: false });
}

async function listRegistros(empresaId, centroCustoIds = []) {
  return listUnidadesExtrato(empresaId, centroCustoIds, { comRegistro: true });
}

// Reúne os 4 buckets pra exportação em Excel — mesmos filtros (Centro de
// Custo, e pra Reserva/Contrato o Tipo de Venda/Situação salvo em
// "Configurar Filtros de Visualização") já aplicados por cada list* acima,
// então o Excel reflete fielmente o que está na tela.
async function listParaExportacao(empresaId, centroCustoIds = []) {
  const [reservas, contratos, assinaturas, registros] = await Promise.all([
    listReservas(empresaId, centroCustoIds),
    listContratos(empresaId, centroCustoIds),
    listAssinaturas(empresaId, centroCustoIds),
    listRegistros(empresaId, centroCustoIds),
  ]);
  return { reservas, contratos, assinaturas, registros };
}

// Uma linha por movimentação manual registrada (ver registrarMovimentacaoMicroEtapa),
// pra aba "Histórico Etapas" do Excel — diferente dos 4 buckets acima (que só
// trazem a ÚLTIMA etapa de cada cartão), aqui é o histórico completo. Ancorado
// direto em centro_custo_sienge_id (já gravado na própria linha), sem repetir
// a lógica de elegibilidade de listCentrosComLancamento: uma movimentação já
// registrada é um fato acontecido, não fica de fora só porque o centro perdeu
// a condição de aparecer no Kanban depois.
async function listHistoricoEtapasParaExportacao(empresaId, centroCustoIds = []) {
  const condicoes = ['h.empresa_id = $1'];
  const params = [empresaId];

  if (Array.isArray(centroCustoIds) && centroCustoIds.length > 0) {
    params.push(centroCustoIds);
    condicoes.push(`h.centro_custo_sienge_id = ANY($${params.length}::int[])`);
  }

  const { rows } = await pool.query(
    `SELECT COALESCE(cc.name, r.empreendimento) AS empreendimento,
            r.cliente, h.idreserva, h.macro_etapa,
            m.descricao AS micro_etapa, h.data_movimentacao,
            h.descricao AS observacao,
            COALESCE(u.nome, 'Usuário removido') AS usuario_nome
     FROM repasses_cef_historico_microetapas h
     JOIN mascara_itens m ON m.id = h.mascara_item_id
     LEFT JOIN centros_custo_sienge cc ON cc.empresa_id = h.empresa_id AND cc.sienge_id = h.centro_custo_sienge_id
     LEFT JOIN construtor_vendas_reservas r ON r.empresa_id = h.empresa_id AND r.idreserva = h.idreserva
     LEFT JOIN usuarios u ON u.id = h.usuario_id
     WHERE ${condicoes.join(' AND ')}
     ORDER BY empreendimento ASC NULLS LAST, h.idreserva ASC, h.data_movimentacao ASC, h.id ASC`,
    params
  );
  return rows;
}

// Data/hora da última atualização de cada bucket, pra mostrar discretamente
// embaixo do título no Kanban. Reserva e Contrato vêm de `criado_em` das
// próprias tabelas — como sincronizarReservas/sincronizarContratos sempre
// apagam tudo e reinserem, `MAX(criado_em)` é exatamente o momento da
// última sincronização. Assinatura e Registro vêm de `extrato_empreendimentos`
// (upload manual na tela Extrato, sem sincronização por API) — sem filtro de
// Centro de Custo, olha a empresa inteira; com filtro, restringe aos
// `contrato_empreendimento` dos centros selecionados (mesmo código
// codigo_contrato_caixa usado pra ligar os buckets aos centros de custo).
async function getUltimaAtualizacaoReserva(empresaId) {
  const { rows } = await pool.query(
    'SELECT MAX(criado_em) AS ultima FROM construtor_vendas_reservas WHERE empresa_id = $1',
    [empresaId]
  );
  return rows[0]?.ultima || null;
}

async function getUltimaAtualizacaoContrato(empresaId) {
  const { rows } = await pool.query(
    'SELECT MAX(criado_em) AS ultima FROM sie_sales_contracts WHERE empresa_id = $1',
    [empresaId]
  );
  return rows[0]?.ultima || null;
}

async function getUltimaAtualizacaoExtrato(empresaId, centroCustoIds = []) {
  const params = [empresaId];
  let condicaoContrato = '';

  if (Array.isArray(centroCustoIds) && centroCustoIds.length > 0) {
    const { rows: codigoRows } = await pool.query(
      `SELECT DISTINCT codigo_contrato_caixa
       FROM centros_custo_sienge
       WHERE empresa_id = $1 AND sienge_id = ANY($2::int[])
         AND codigo_contrato_caixa IS NOT NULL AND codigo_contrato_caixa != ''`,
      [empresaId, centroCustoIds]
    );
    const codigos = codigoRows.map((r) => r.codigo_contrato_caixa);
    params.push(codigos.length > 0 ? codigos : ['__nenhum_codigo_configurado__']);
    condicaoContrato = 'AND contrato_empreendimento = ANY($2::text[])';
  }

  const { rows } = await pool.query(
    `SELECT MAX(importado_em) AS ultima FROM extrato_empreendimentos WHERE empresa_id = $1 ${condicaoContrato}`,
    params
  );
  return rows[0]?.ultima || null;
}

async function getUltimasAtualizacoes(empresaId, centroCustoIds = []) {
  const [reserva, contrato, extrato] = await Promise.all([
    getUltimaAtualizacaoReserva(empresaId),
    getUltimaAtualizacaoContrato(empresaId),
    getUltimaAtualizacaoExtrato(empresaId, centroCustoIds),
  ]);
  return { reserva, contrato, assinatura: extrato, registro: extrato };
}

// Progresso "ao vivo" (página atual / total de páginas) das sincronizações
// em andamento pra essa empresa — o frontend faz polling nisso enquanto
// espera o POST de sincronizar-*, pra desenhar a barra de progresso no log
// de atualização.
function getStatusSincronizacao(empresaId) {
  return {
    sienge: progresso.get(empresaId, 'sienge'),
    cvcrm: progresso.get(empresaId, 'cvcrm'),
  };
}

// ---------------------------------------------------------------------
// Histórico de Etapas — dado qualquer um dos 3 identificadores (idreserva,
// sienge_contract_id ou extrato_unidades.id), resolve a cadeia completa
// reserva ↔ contrato ↔ unidade (mesmas ligações já usadas nos buckets:
// idreserva ↔ external_id, financial_institution_number ↔
// numero_contrato_unidade) e monta o cabeçalho + a timeline de 4 etapas.
// ---------------------------------------------------------------------

async function buscarReservaPorIdreserva(empresaId, idreserva) {
  const { rows } = await pool.query(
    `SELECT r.idreserva, r.cliente, r.data_cad,
            COALESCE(cc.name, r.empreendimento) AS empreendimento
     FROM construtor_vendas_reservas r
     LEFT JOIN centros_custo_sienge cc
       ON cc.empresa_id = r.empresa_id AND cc.codigo_construtor_vendas = r.codigointerno_empreendimento
     WHERE r.empresa_id = $1 AND r.idreserva = $2`,
    [empresaId, idreserva]
  );
  return rows[0] || null;
}

async function buscarContratoPorId(empresaId, siengeContractId) {
  const { rows } = await pool.query(
    `SELECT c.sienge_contract_id, c.number, c.external_id, c.contract_date, c.financial_institution_number,
            COALESCE(cc.name, c.enterprise_name) AS empreendimento
     FROM sie_sales_contracts c
     LEFT JOIN centros_custo_sienge cc ON cc.empresa_id = c.empresa_id AND cc.sienge_id = c.enterprise_id
     WHERE c.empresa_id = $1 AND c.sienge_contract_id = $2`,
    [empresaId, siengeContractId]
  );
  return rows[0] || null;
}

async function buscarContratoPorIdreserva(empresaId, idreserva) {
  const { rows } = await pool.query(
    `SELECT c.sienge_contract_id, c.number, c.external_id, c.contract_date, c.financial_institution_number,
            COALESCE(cc.name, c.enterprise_name) AS empreendimento
     FROM sie_sales_contracts c
     LEFT JOIN centros_custo_sienge cc ON cc.empresa_id = c.empresa_id AND cc.sienge_id = c.enterprise_id
     WHERE c.empresa_id = $1 AND c.number LIKE 'CV%' AND c.external_id = $2::text
     LIMIT 1`,
    [empresaId, String(idreserva)]
  );
  return rows[0] || null;
}

async function buscarContratoPorFinancialInstitutionNumber(empresaId, numero) {
  if (!numero) return null;
  const { rows } = await pool.query(
    `SELECT c.sienge_contract_id, c.number, c.external_id, c.contract_date, c.financial_institution_number,
            COALESCE(cc.name, c.enterprise_name) AS empreendimento
     FROM sie_sales_contracts c
     LEFT JOIN centros_custo_sienge cc ON cc.empresa_id = c.empresa_id AND cc.sienge_id = c.enterprise_id
     WHERE c.empresa_id = $1 AND c.financial_institution_number = $2
     LIMIT 1`,
    [empresaId, numero]
  );
  return rows[0] || null;
}

async function buscarUnidadePorId(empresaId, id) {
  const { rows } = await pool.query(
    `SELECT u.id, u.numero_contrato_unidade, u.nome_mutuario,
            u.data_assinatura_contrato, u.data_inclusao_dados_registro_cri,
            COALESCE(cc.name, u.contrato_empreendimento) AS empreendimento
     FROM extrato_unidades u
     LEFT JOIN centros_custo_sienge cc
       ON cc.empresa_id = u.empresa_id AND cc.codigo_contrato_caixa = u.contrato_empreendimento
     WHERE u.empresa_id = $1 AND u.id = $2`,
    [empresaId, id]
  );
  return rows[0] || null;
}

async function buscarUnidadePorNumeroContratoUnidade(empresaId, numero) {
  if (!numero) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.numero_contrato_unidade, u.nome_mutuario,
            u.data_assinatura_contrato, u.data_inclusao_dados_registro_cri,
            COALESCE(cc.name, u.contrato_empreendimento) AS empreendimento
     FROM extrato_unidades u
     LEFT JOIN centros_custo_sienge cc
       ON cc.empresa_id = u.empresa_id AND cc.codigo_contrato_caixa = u.contrato_empreendimento
     WHERE u.empresa_id = $1 AND u.numero_contrato_unidade = $2
     LIMIT 1`,
    [empresaId, numero]
  );
  return rows[0] || null;
}

async function getHistoricoEtapas(empresaId, { idreserva, siengeContractId, extratoUnidadeId }) {
  let reserva = idreserva ? await buscarReservaPorIdreserva(empresaId, idreserva) : null;
  let contrato = siengeContractId ? await buscarContratoPorId(empresaId, siengeContractId) : null;
  let unidade = extratoUnidadeId ? await buscarUnidadePorId(empresaId, extratoUnidadeId) : null;

  if (!contrato) {
    if (reserva) contrato = await buscarContratoPorIdreserva(empresaId, reserva.idreserva);
    else if (unidade) contrato = await buscarContratoPorFinancialInstitutionNumber(empresaId, unidade.numero_contrato_unidade);
  }

  if (!reserva && contrato && contrato.number?.startsWith('CV') && /^[0-9]+$/.test(contrato.external_id || '')) {
    reserva = await buscarReservaPorIdreserva(empresaId, Number(contrato.external_id));
  }

  if (!unidade && contrato) {
    unidade = await buscarUnidadePorNumeroContratoUnidade(empresaId, contrato.financial_institution_number);
  }

  if (!reserva && !contrato && !unidade) {
    throw badRequest('Não foi possível localizar o histórico desse cliente.');
  }

  const cabecalho = {
    empreendimento: contrato?.empreendimento || reserva?.empreendimento || unidade?.empreendimento || null,
    cliente: reserva?.cliente || unidade?.nome_mutuario || null,
    numero_reserva: reserva?.idreserva ?? null,
    numero_contrato: contrato?.number ?? null,
    numero_contrato_caixa: contrato?.financial_institution_number || unidade?.numero_contrato_unidade || null,
    data_assinatura: unidade?.data_assinatura_contrato ?? null,
    data_registro: unidade?.data_inclusao_dados_registro_cri ?? null,
  };

  // As 4 etapas sempre aparecem, na ordem do funil — "alcancada" indica se
  // já tem registro correspondente (não se tem data preenchida: uma etapa
  // alcançada com data em branco ainda é "alcançada", só sem data pra
  // mostrar). Registro é a única com um critério mais estrito (precisa da
  // data de registro em si), já que a unidade pode existir só até Assinatura.
  const etapas = [
    { etapa: 'Reserva', data: reserva?.data_cad ?? null, alcancada: Boolean(reserva) },
    { etapa: 'Contrato', data: contrato?.contract_date ?? null, alcancada: Boolean(contrato) },
    { etapa: 'Assinatura', data: unidade?.data_assinatura_contrato ?? null, alcancada: Boolean(unidade) },
    {
      etapa: 'Registro',
      data: unidade?.data_inclusao_dados_registro_cri ?? null,
      alcancada: Boolean(unidade?.data_inclusao_dados_registro_cri),
    },
  ];

  // Micro etapas registradas manualmente (ver registrarMovimentacaoMicroEtapa)
  // — ancoradas por idreserva, então acompanham o cliente através dos
  // buckets. Cada uma entra debaixo da etapa correspondente ao seu
  // macro_etapa (mesmo código usado como `grupo` em mascara_itens).
  const microetapasPorMacro = reserva ? await listMicroEtapasPorReserva(empresaId, reserva.idreserva) : {};
  const historico = etapas.map((atual, i) => ({
    ...atual,
    etapaAnterior: i === 0 ? null : etapas[i - 1].etapa,
    microetapas: microetapasPorMacro[ETAPA_LABEL_PARA_MACRO[atual.etapa]] || [],
  }));

  return { cabecalho, historico };
}

const ETAPA_LABEL_PARA_MACRO = {
  Reserva: 'VENDA',
  Contrato: 'CONTRATO',
  Assinatura: 'ASSINATURA',
  Registro: 'REGISTRO',
};

const MICROETAPAS_UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'repasses-cef-historico');

function sanitizeNomeArquivo(nome) {
  return String(nome).replace(/[^a-zA-Z0-9_.-]/g, '_');
}

async function resolverCentroCustoDaReserva(empresaId, idreserva) {
  const { rows } = await pool.query(
    `SELECT cc.sienge_id
     FROM construtor_vendas_reservas r
     JOIN centros_custo_sienge cc
       ON cc.empresa_id = r.empresa_id AND cc.codigo_construtor_vendas = r.codigointerno_empreendimento
     WHERE r.empresa_id = $1 AND r.idreserva = $2
     LIMIT 1`,
    [empresaId, idreserva]
  );
  return rows[0]?.sienge_id ?? null;
}

// Movimentações registradas manualmente pra uma reserva, já com o nome da
// micro etapa (join com mascara_itens) e os anexos de cada uma — agrupadas
// por macro_etapa, pra encaixar direto em cada etapa do histórico.
async function listMicroEtapasPorReserva(empresaId, idreserva) {
  const { rows } = await pool.query(
    `SELECT h.id, h.macro_etapa, h.data_movimentacao, h.descricao, h.criado_em,
            m.descricao AS micro_etapa_nome, u.nome AS usuario_nome, u.avatar_url AS usuario_avatar_url
     FROM repasses_cef_historico_microetapas h
     JOIN mascara_itens m ON m.id = h.mascara_item_id
     LEFT JOIN usuarios u ON u.id = h.usuario_id
     WHERE h.empresa_id = $1 AND h.idreserva = $2
     ORDER BY h.data_movimentacao ASC, h.id ASC`,
    [empresaId, idreserva]
  );

  if (rows.length === 0) return {};

  const { rows: anexos } = await pool.query(
    `SELECT id, historico_id, nome_original
     FROM repasses_cef_historico_microetapas_anexos
     WHERE historico_id = ANY($1::int[])
     ORDER BY id ASC`,
    [rows.map((r) => r.id)]
  );

  const anexosPorHistorico = {};
  for (const a of anexos) {
    (anexosPorHistorico[a.historico_id] ??= []).push({ id: a.id, nome_original: a.nome_original });
  }

  const porMacro = {};
  for (const r of rows) {
    (porMacro[r.macro_etapa] ??= []).push({
      id: r.id,
      micro_etapa_nome: r.micro_etapa_nome,
      data_movimentacao: r.data_movimentacao,
      descricao: r.descricao,
      usuario_nome: r.usuario_nome,
      usuario_avatar_url: r.usuario_avatar_url,
      anexos: anexosPorHistorico[r.id] || [],
    });
  }
  return porMacro;
}

// Registra uma movimentação de micro etapa — sempre ancorada por
// (empresa_id, idreserva) e pelo centro de custo resolvido na hora (mesma
// ligação usada em listReservas), garantindo que o histórico acompanha a
// reserva através dos buckets sem se perder nem duplicar. `arquivos` são os
// arquivos já salvos em disco temporário pelo multer — cada um é copiado
// pra pasta definitiva e vira uma linha em repasses_cef_historico_microetapas_anexos.
async function registrarMovimentacaoMicroEtapa(empresaId, { idreserva, macroEtapa, mascaraItemId, dataMovimentacao, descricao, usuarioId, arquivos }) {
  const centroCustoSiengeId = await resolverCentroCustoDaReserva(empresaId, idreserva);
  if (!centroCustoSiengeId) {
    throw badRequest('Não foi possível identificar o centro de custo dessa reserva.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO repasses_cef_historico_microetapas
         (empresa_id, idreserva, centro_custo_sienge_id, macro_etapa, mascara_item_id, data_movimentacao, descricao, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [empresaId, idreserva, centroCustoSiengeId, macroEtapa, mascaraItemId, dataMovimentacao, descricao || null, usuarioId || null]
    );
    const historicoId = rows[0].id;

    if (arquivos && arquivos.length > 0) {
      const empresaDir = path.join(MICROETAPAS_UPLOADS_DIR, String(empresaId));
      fs.mkdirSync(empresaDir, { recursive: true });

      for (const arquivo of arquivos) {
        const nomeArmazenado = `${Date.now()}_${sanitizeNomeArquivo(arquivo.originalname)}`;
        fs.copyFileSync(arquivo.path, path.join(empresaDir, nomeArmazenado));
        fs.unlink(arquivo.path, () => {});

        await client.query(
          `INSERT INTO repasses_cef_historico_microetapas_anexos
             (historico_id, nome_original, arquivo_armazenado, tamanho_bytes)
           VALUES ($1, $2, $3, $4)`,
          [historicoId, arquivo.originalname, path.join(String(empresaId), nomeArmazenado), arquivo.size]
        );
      }
    }

    await client.query('COMMIT');
    return { id: historicoId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getAnexoMicroEtapa(empresaId, anexoId) {
  const { rows } = await pool.query(
    `SELECT a.nome_original, a.arquivo_armazenado
     FROM repasses_cef_historico_microetapas_anexos a
     JOIN repasses_cef_historico_microetapas h ON h.id = a.historico_id
     WHERE a.id = $1 AND h.empresa_id = $2`,
    [anexoId, empresaId]
  );
  const anexo = rows[0];
  if (!anexo) return null;

  const caminhoAbsoluto = path.join(MICROETAPAS_UPLOADS_DIR, anexo.arquivo_armazenado);
  if (!fs.existsSync(caminhoAbsoluto)) return null;

  return { caminhoAbsoluto, nomeOriginal: anexo.nome_original || 'anexo' };
}

// Opções pro combobox de "Número da Instituição Financeira" (edição no
// bucket Contrato) — toda unidade da empresa que ainda não está vinculada a
// NENHUM contrato, mais o valor já vinculado ao contrato em edição (senão
// ele sumiria da lista ao reabrir o modal).
// `contratoEmpreendimento`, quando informado, restringe às unidades do
// mesmo empreendimento do contrato (evita listar unidades de outro
// empreendimento no combobox).
async function listUnidadesDisponiveisParaVinculo(empresaId, manterNumero, contratoEmpreendimento) {
  const { rows } = await pool.query(
    `SELECT u.numero_contrato_unidade, u.nome_mutuario
     FROM extrato_unidades u
     WHERE u.empresa_id = $1
       AND ($3::text IS NULL OR u.contrato_empreendimento = $3)
       AND (
         u.numero_contrato_unidade = $2
         OR NOT EXISTS (
           SELECT 1 FROM sie_sales_contracts c
           WHERE c.empresa_id = u.empresa_id AND c.financial_institution_number = u.numero_contrato_unidade
         )
       )
     ORDER BY u.nome_mutuario NULLS LAST, u.numero_contrato_unidade`,
    [empresaId, manterNumero || '__nenhum__', contratoEmpreendimento || null]
  );
  return rows;
}

async function listUnidadesDisponiveisParaContrato(empresaId, siengeContractId) {
  const { rows } = await pool.query(
    `SELECT c.financial_institution_number, cc.codigo_contrato_caixa
     FROM sie_sales_contracts c
     LEFT JOIN centros_custo_sienge cc ON cc.empresa_id = c.empresa_id AND cc.sienge_id = c.enterprise_id
     WHERE c.empresa_id = $1 AND c.sienge_contract_id = $2`,
    [empresaId, siengeContractId]
  );
  if (rows.length === 0) {
    throw badRequest('Contrato não encontrado para essa empresa.');
  }
  const { financial_institution_number: manterNumero, codigo_contrato_caixa: contratoEmpreendimento } = rows[0];
  return listUnidadesDisponiveisParaVinculo(empresaId, manterNumero, contratoEmpreendimento);
}

module.exports = {
  listCentrosComLancamento,
  sincronizarReservas,
  listReservas,
  listOpcoesFiltroReserva,
  getFiltrosReserva,
  salvarFiltrosReserva,
  getCoresReserva,
  salvarCoresReserva,
  sincronizarContratos,
  listContratos,
  listAssinaturas,
  listRegistros,
  getStatusSincronizacao,
  getUltimasAtualizacoes,
  listParaExportacao,
  listHistoricoEtapasParaExportacao,
  atualizarNumeroInstituicaoFinanceira,
  getHistoricoEtapas,
  listUnidadesDisponiveisParaContrato,
  registrarMovimentacaoMicroEtapa,
  getAnexoMicroEtapa,
};
