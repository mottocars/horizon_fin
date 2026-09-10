const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const { fetchAllCustomers } = require('./customers-api.client');
// Sincroniza os clientes (customers) do Sienge — mesmo padrão do
// income-sienge (ver income.service.js): apaga tudo da empresa e reinsere
// inteiro a cada sincronização, dentro de uma única transação, gravando o
// empresa_id de quem sincronizou em toda linha. A diferença é só na busca:
// aqui pagina de verdade (ver customers-api.client.js), o income usa
// bulk-data (uma chamada só).

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
// por query) — mesmo critério de income.service.js.
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

const COLUNAS_CLIENTE = [
  'id', 'empresa_id', 'person_type', 'foreigner', 'international_id', 'created_at', 'modified_at',
  'modified_at_date_time', 'issuing_body', 'name', 'social_name', 'email', 'birth_date', 'birth_place',
  'civil_status', 'cpf', 'father_name', 'mother_name', 'sex', 'issue_date_identity_card', 'matrimonial_regime',
  'marriage_date', 'nationality', 'number_identity_card', 'profession', 'mailing_address', 'license_number',
  'license_issuing_body', 'license_issue_date', 'city_registration_number', 'cnae_number', 'cnpj', 'contact_name',
  'crea_number', 'establishment_date', 'fantasy_name', 'note', 'site', 'share_capital', 'state_registration_number',
  'technical_manager', 'client_type', 'activity_id', 'activity_description', 'government_entity_id',
  'government_entity_description',
];

const COLUNAS_SUB_TYPE = ['customer_id', 'empresa_id', 'sub_type_id', 'description'];
const COLUNAS_PHONE = ['customer_id', 'empresa_id', 'number', 'main', 'type', 'note', 'idd'];
const COLUNAS_ADDRESS = [
  'customer_id', 'empresa_id', 'type', 'street_name', 'number', 'complement', 'neighborhood', 'city_id', 'city',
  'state', 'zip_code', 'mail',
];
const COLUNAS_AGENT = ['customer_id', 'empresa_id', 'agent_id'];
const COLUNAS_FAMILY_INCOME = ['customer_id', 'empresa_id', 'kins_name', 'kinship', 'income_value', 'observation'];
const COLUNAS_PROCURATOR = [
  'customer_id', 'empresa_id', 'cpf', 'email', 'name', 'profession', 'civil_status', 'nationality',
  'number_identity_card', 'proxy_book', 'proxy_date', 'proxy_expiration_date', 'proxy_district', 'proxy_registry',
  'proxy_sheet',
];
const COLUNAS_PROCURATOR_ADDRESS = [
  'procurator_id', 'type', 'street_name', 'number', 'complement', 'neighborhood', 'city', 'state', 'zip_code',
];
const COLUNAS_PROCURATOR_PHONE = ['procurator_id', 'number', 'main', 'type', 'note', 'idd'];
const COLUNAS_SPOUSE = [
  'customer_id', 'empresa_id', 'cpf', 'name', 'email', 'sex', 'foreigner', 'international_id', 'civil_status',
  'birth_date', 'number_identity_card', 'issue_date_identity_card', 'profession', 'nationality', 'birth_place',
  'father_name', 'mother_name', 'cellphone_number', 'business_phone', 'company', 'endereco_city',
  'endereco_complement', 'endereco_neighborhood', 'endereco_number', 'endereco_street_name', 'endereco_zip_code',
];

function linhaCliente(empresaId, r) {
  return [
    v(r.id), empresaId, v(r.personType), v(r.foreigner), v(r.internationalId), v(r.createdAt), v(r.modifiedAt),
    v(r.modifiedAtDateTime), v(r.issuingBody), v(r.name), v(r.socialName), v(r.email), v(r.birthDate),
    v(r.birthPlace), v(r.civilStatus), v(r.cpf), v(r.fatherName), v(r.motherName), v(r.sex),
    v(r.issueDateIdentityCard), v(r.matrimonialRegime), v(r.marriageDate), v(r.nationality),
    v(r.numberIdentityCard), v(r.profession), v(r.mailingAddress), v(r.licenseNumber), v(r.licenseIssuingBody),
    v(r.licenseIssueDate), v(r.cityRegistrationNumber), v(r.cnaeNumber), v(r.cnpj), v(r.contactName),
    v(r.creaNumber), v(r.establishmentDate), v(r.fantasyName), v(r.note), v(r.site), v(r.shareCapital),
    v(r.stateRegistrationNumber), v(r.technicalManager), v(r.clientType), v(r.activityId),
    v(r.activityDescription), v(r.governmentEntityId), v(r.governmentEntityDescription),
  ];
}

function linhaSubType(customerId, empresaId, st) {
  return [customerId, empresaId, v(st.id), v(st.description)];
}

function linhaPhone(customerId, empresaId, p) {
  return [customerId, empresaId, v(p.number), v(p.main), v(p.type), v(p.note), v(p.idd)];
}

function linhaAddress(customerId, empresaId, a) {
  return [
    customerId, empresaId, v(a.type), v(a.streetName), v(a.number), v(a.complement), v(a.neighborhood),
    v(a.cityId), v(a.city), v(a.state), v(a.zipCode), v(a.mail),
  ];
}

function linhaAgent(customerId, empresaId, ag) {
  return [customerId, empresaId, v(ag.id)];
}

function linhaFamilyIncome(customerId, empresaId, fi) {
  return [customerId, empresaId, v(fi.kinsName), v(fi.kinship), v(fi.incomeValue), v(fi.observation)];
}

function linhaProcurator(customerId, empresaId, proc) {
  return [
    customerId, empresaId, v(proc.cpf), v(proc.email), v(proc.name), v(proc.profession), v(proc.civilStatus),
    v(proc.nationality), v(proc.numberIdentityCard), v(proc.proxy?.book), v(proc.proxy?.date),
    v(proc.proxy?.expirationDate), v(proc.proxy?.district), v(proc.proxy?.registry), v(proc.proxy?.sheet),
  ];
}

function linhaProcuratorAddress(procuratorId, a) {
  return [procuratorId, v(a.type), v(a.streetName), v(a.number), v(a.complement), v(a.neighborhood), v(a.city), v(a.state), v(a.zipCode)];
}

function linhaProcuratorPhone(procuratorId, p) {
  return [procuratorId, v(p.number), v(p.main), v(p.type), v(p.note), v(p.idd)];
}

// `spouse.addresses` é um objeto único (não lista, diferente do resto) —
// achatado direto na linha com prefixo `endereco_`.
function linhaSpouse(customerId, empresaId, sp) {
  return [
    customerId, empresaId, v(sp.cpf), v(sp.name), v(sp.email), v(sp.sex), v(sp.foreigner), v(sp.internationalId),
    v(sp.civilStatus), v(sp.birthDate), v(sp.numberIdentityCard), v(sp.issueDateIdentityCard), v(sp.profession),
    v(sp.nationality), v(sp.birthPlace), v(sp.fatherName), v(sp.motherName), v(sp.cellphoneNumber),
    v(sp.businessPhone), v(sp.company), v(sp.addresses?.city), v(sp.addresses?.complement),
    v(sp.addresses?.neighborhood), v(sp.addresses?.number), v(sp.addresses?.streetName), v(sp.addresses?.zipCode),
  ];
}

// Um objeto vazio (a API pode devolver `{}` em vez de omitir/null quando
// não há procurador/cônjuge) não deve virar uma linha só de colunas
// vazias — só grava quando existe pelo menos 1 campo com valor real.
function temConteudo(obj) {
  return obj && typeof obj === 'object' && Object.values(obj).some((val) => val !== null && val !== undefined && val !== '');
}

async function sincronizar(empresaId, onProgress) {
  const integracao = await getIntegracaoAtiva(empresaId);
  if (!integracao) {
    const e = new Error('Esta empresa não possui uma integração com o Sienge ativa configurada.');
    e.status = 400;
    e.expose = true;
    throw e;
  }

  const password = decrypt(integracao.password_enc);
  const registros = await fetchAllCustomers({
    tenant: integracao.tenant,
    username: integracao.username,
    password,
    onProgress,
  });

  const linhasClientes = [];
  const linhasSubTypes = [];
  const linhasPhones = [];
  const linhasAddresses = [];
  const linhasAgents = [];
  const linhasFamilyIncome = [];
  const linhasProcurators = [];
  // Cada item guarda a linha pronta pro INSERT do procurador + os
  // addresses/phones brutos dele, pra processar assim que soubermos o id
  // gerado (mesmo índice da linha correspondente) — igual à ligação
  // recebimento -> movimentos em income.service.js.
  const procuratorsBrutos = [];
  const linhasSpouse = [];

  for (const r of registros) {
    linhasClientes.push(linhaCliente(empresaId, r));
    for (const st of r.subTypes || []) linhasSubTypes.push(linhaSubType(r.id, empresaId, st));
    for (const p of r.phones || []) linhasPhones.push(linhaPhone(r.id, empresaId, p));
    for (const a of r.addresses || []) linhasAddresses.push(linhaAddress(r.id, empresaId, a));
    for (const ag of r.agents || []) linhasAgents.push(linhaAgent(r.id, empresaId, ag));
    for (const fi of r.familyIncome || []) linhasFamilyIncome.push(linhaFamilyIncome(r.id, empresaId, fi));

    if (temConteudo(r.procurators)) {
      procuratorsBrutos.push({
        linha: linhaProcurator(r.id, empresaId, r.procurators),
        addresses: r.procurators.addresses || [],
        phones: r.procurators.phones || [],
      });
    }

    if (temConteudo(r.spouse)) linhasSpouse.push(linhaSpouse(r.id, empresaId, r.spouse));
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Cascateia pras 9 tabelas filhas via FK (customer_id, empresa_id) ->
    // sie_customers (id, empresa_id) ON DELETE CASCADE — não precisa
    // apagar cada uma na mão.
    await client.query('DELETE FROM sie_customers WHERE empresa_id = $1', [empresaId]);

    await inserirEmLotes(client, 'sie_customers', COLUNAS_CLIENTE, linhasClientes);
    await inserirEmLotes(client, 'sie_customers_sub_types', COLUNAS_SUB_TYPE, linhasSubTypes);
    await inserirEmLotes(client, 'sie_customers_phones', COLUNAS_PHONE, linhasPhones);
    await inserirEmLotes(client, 'sie_customers_addresses', COLUNAS_ADDRESS, linhasAddresses);
    await inserirEmLotes(client, 'sie_customers_agents', COLUNAS_AGENT, linhasAgents);
    await inserirEmLotes(client, 'sie_customers_family_income', COLUNAS_FAMILY_INCOME, linhasFamilyIncome);
    await inserirEmLotes(client, 'sie_customers_spouse', COLUNAS_SPOUSE, linhasSpouse);

    const idsProcurators = await inserirEmLotes(
      client,
      'sie_customers_procurators',
      COLUNAS_PROCURATOR,
      procuratorsBrutos.map((item) => item.linha),
      { retornarId: true }
    );

    const linhasProcuratorAddresses = [];
    const linhasProcuratorPhones = [];
    procuratorsBrutos.forEach((item, i) => {
      const procuratorId = idsProcurators[i];
      item.addresses.forEach((a) => linhasProcuratorAddresses.push(linhaProcuratorAddress(procuratorId, a)));
      item.phones.forEach((p) => linhasProcuratorPhones.push(linhaProcuratorPhone(procuratorId, p)));
    });

    await inserirEmLotes(client, 'sie_customers_procurator_addresses', COLUNAS_PROCURATOR_ADDRESS, linhasProcuratorAddresses);
    await inserirEmLotes(client, 'sie_customers_procurator_phones', COLUNAS_PROCURATOR_PHONE, linhasProcuratorPhones);

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
    `SELECT COUNT(*)::int AS total_clientes, MAX(atualizado_em) AS ultima_sincronizacao
     FROM sie_customers WHERE empresa_id = $1`,
    [empresaId]
  );
  return rows[0];
}

// Só parcelas com origin_id = 'CO' são contas a receber de verdade (mesmo
// critério de cobrancaClusters.service.js::ORIGIN_ID_PADRAO) — replicado
// aqui em vez de importado porque os dois módulos não têm nenhuma outra
// dependência um do outro, e um `require` cruzado só pra isso criaria um
// acoplamento estranho entre "sincronizar clientes" e "clusterizar
// clientes" (duas features vizinhas, mas independentes).
const ORIGIN_ID_PADRAO = 'CO';

// Condição "cliente ativo": tem pelo menos 1 parcela (contas a receber, ver
// ORIGIN_ID_PADRAO) com saldo diferente de zero — a conta em aberto que o
// cliente ainda deve pagar. `params` é mutado (bind params da query em
// montagem, mesmo padrão de cobrancaClusters.service.js::condicaoCentroCusto);
// devolve o SQL da subquery de client_ids ativos daquele centro de custo.
function subqueryClientesAtivos(params, costCenterId) {
  params.push(costCenterId, ORIGIN_ID_PADRAO);
  return `(
    SELECT DISTINCT si.client_id
    FROM sie_income_categorias cat
    JOIN sie_income si
      ON si.bill_id = cat.bill_id AND si.installment_id = cat.installment_id AND si.empresa_id = cat.empresa_id
    WHERE cat.empresa_id = $1 AND cat.cost_center_id = $${params.length - 1} AND si.origin_id = $${params.length}
      AND si.corrected_balance_amount <> 0
  )`;
}

// Resumo por Centro de Custo (nível 1 do drilldown da aba Clientes) —
// mesmo universo de centros ("com a etapa Lançamento já registrada", ver
// cobrancaClusters.service.js::getResumoPorCentroCusto), mas contando
// CLIENTES (sie_customers, pra exibir nome/CPF/telefone/e-mail no nível de
// baixo), não os clusters de risco: só entra quem tem pelo menos 1 conta em
// aberto atribuída àquele centro de custo e que a gente já tenha o
// cadastro completo (JOIN com sie_customers — um client_id sem cadastro
// sincronizado não tem nome pra mostrar na lista de baixo). Só a
// quantidade importa aqui — sem saldo, não faz parte desta tela.
// `todos_comunicam` é o estado do checkbox "Comunicar" deste NÍVEL (o
// centro de custo inteiro, sem precisar expandir — ver ClientesTab.jsx):
// TRUE só quando todo cliente ativo do centro (dentro do filtro `search`
// abaixo) está marcado; BOOL_AND sobre linhas repetidas do mesmo client_id
// (1 por parcela) não distorce nada, diferente de uma soma — é só AND do
// mesmo valor repetido.
//
// `search`: a mesma busca por nome/CPF/CNPJ do nível 2 (ver
// listClientesPorCentroCusto), mas agora também filtrando ESTE nível — a
// matriz inteira reage à busca, não só a lista de clientes de dentro de um
// centro já expandido: um centro sem nenhum cliente ativo batendo com a
// busca nem aparece na lista (ver o .filter no final), e a contagem
// "Clientes ativos" mostrada reflete só quem bate, não o total do centro.
// Sem busca, comportamento idêntico a antes (mostra todo o universo, até
// centro com 0 cliente ativo).
async function getResumoPorCentroCusto(empresaId, { costCenterIds, search = '' } = {}) {
  const paramsCentros = [empresaId];
  let filtroSelecao = '';
  if (Array.isArray(costCenterIds) && costCenterIds.length > 0) {
    paramsCentros.push(costCenterIds);
    filtroSelecao = ` AND c.sienge_id = ANY($${paramsCentros.length}::bigint[])`;
  }
  const { rows: centros } = await pool.query(
    `SELECT DISTINCT c.sienge_id, c.name
     FROM centros_custo_sienge c
     JOIN centro_custo_etapas_historico h
       ON h.sienge_id = c.sienge_id AND h.empresa_id = c.empresa_id AND h.data_inicio IS NOT NULL
     JOIN mascara_itens m
       ON m.id = h.mascara_item_id AND m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.descricao = 'Lançamento'
     WHERE c.empresa_id = $1${filtroSelecao}
     ORDER BY c.name ASC`,
    paramsCentros
  );
  if (centros.length === 0) return [];

  const idsPermitidos = centros.map((c) => c.sienge_id);
  const termo = search ? `%${search}%` : null;
  const { rows: contagens } = await pool.query(
    `SELECT cat.cost_center_id, COUNT(DISTINCT si.client_id)::int AS total_clientes_ativos,
            BOOL_AND(COALESCE(com.comunicar, TRUE)) AS todos_comunicam
     FROM sie_income_categorias cat
     JOIN sie_income si
       ON si.bill_id = cat.bill_id AND si.installment_id = cat.installment_id AND si.empresa_id = cat.empresa_id
     JOIN sie_customers sc ON sc.id = si.client_id AND sc.empresa_id = si.empresa_id
     LEFT JOIN sie_customers_comunicar com ON com.empresa_id = si.empresa_id AND com.client_id = si.client_id
     WHERE cat.empresa_id = $1 AND si.origin_id = $2 AND si.corrected_balance_amount <> 0
       AND cat.cost_center_id = ANY($3::bigint[])
       AND ($4::text IS NULL OR sc.name ILIKE $4 OR sc.cpf ILIKE $4 OR sc.cnpj ILIKE $4)
     GROUP BY cat.cost_center_id`,
    [empresaId, ORIGIN_ID_PADRAO, idsPermitidos, termo]
  );

  // `cost_center_id` volta do driver `pg` como string (coluna bigint) —
  // normaliza pra String() dos dois lados antes de usar como chave do Map
  // (mesmo cuidado de cobrancaClusters.service.js::getResumoPorCentroCusto).
  const contagemPorCentro = new Map();
  for (const row of contagens) {
    contagemPorCentro.set(String(row.cost_center_id), {
      total_clientes_ativos: row.total_clientes_ativos,
      todos_comunicam: row.todos_comunicam,
    });
  }

  const resultado = centros.map((c) => {
    const info = contagemPorCentro.get(String(c.sienge_id)) || { total_clientes_ativos: 0, todos_comunicam: true };
    return { cost_center_id: c.sienge_id, cost_center_name: c.name, ...info };
  });

  return search ? resultado.filter((c) => c.total_clientes_ativos > 0) : resultado;
}

// Nível 2 do drilldown: os clientes ativos (conta em aberto) de 1 centro de
// custo específico, com busca por nome/CPF/CNPJ e paginação — mesmo
// formato de listClientesPorCluster em cobrancaClusters.service.js. Traz o
// telefone principal (o marcado `main = true`; sem nenhum marcado, pega o
// primeiro cadastrado) e o estado da flag "Comunicar" (sem linha em
// sie_customers_comunicar = TRUE, ver comentário da tabela no schema).
async function listClientesPorCentroCusto(empresaId, costCenterId, { search = '', page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const termo = search ? `%${search}%` : null;

  const paramsLista = [empresaId];
  const subAtivosLista = subqueryClientesAtivos(paramsLista, costCenterId);
  paramsLista.push(termo);
  const paramTermo = paramsLista.length;
  paramsLista.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT sc.id AS client_id, sc.name, sc.cpf, sc.cnpj, sc.email, sc.person_type, sc.client_type,
            tel.number AS telefone, COALESCE(com.comunicar, TRUE) AS comunicar
     FROM sie_customers sc
     JOIN ${subAtivosLista} ativos ON ativos.client_id = sc.id
     LEFT JOIN LATERAL (
       SELECT number FROM sie_customers_phones p
       WHERE p.customer_id = sc.id AND p.empresa_id = sc.empresa_id
       ORDER BY p.main DESC NULLS LAST, p.id ASC
       LIMIT 1
     ) tel ON TRUE
     LEFT JOIN sie_customers_comunicar com ON com.empresa_id = sc.empresa_id AND com.client_id = sc.id
     WHERE sc.empresa_id = $1
       AND ($${paramTermo}::text IS NULL OR sc.name ILIKE $${paramTermo} OR sc.cpf ILIKE $${paramTermo} OR sc.cnpj ILIKE $${paramTermo})
     ORDER BY sc.name ASC
     LIMIT $${paramTermo + 1} OFFSET $${paramTermo + 2}`,
    paramsLista
  );

  const paramsCount = [empresaId];
  const subAtivosCount = subqueryClientesAtivos(paramsCount, costCenterId);
  paramsCount.push(termo);
  const paramTermoCount = paramsCount.length;
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM sie_customers sc
     JOIN ${subAtivosCount} ativos ON ativos.client_id = sc.id
     WHERE sc.empresa_id = $1
       AND ($${paramTermoCount}::text IS NULL OR sc.name ILIKE $${paramTermoCount} OR sc.cpf ILIKE $${paramTermoCount} OR sc.cnpj ILIKE $${paramTermoCount})`,
    paramsCount
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

// Marca/desmarca "Comunicar" de 1 cliente só — cada linha da lista tem a
// própria flag (ver EXCLUSÃO acima do porquê de ser upsert, não update:
// sem linha ainda = valor implícito TRUE, a primeira mudança cria a linha).
async function setComunicar(empresaId, clientId, comunicar) {
  await pool.query(
    `INSERT INTO sie_customers_comunicar (empresa_id, client_id, comunicar)
     VALUES ($1, $2, $3)
     ON CONFLICT (empresa_id, client_id) DO UPDATE SET comunicar = EXCLUDED.comunicar, atualizado_em = NOW()`,
    [empresaId, clientId, comunicar]
  );
  return { client_id: clientId, comunicar };
}

// Marca/desmarca "Comunicar" de TODOS os clientes ativos de 1 centro de
// custo de uma vez (o checkbox do cabeçalho da coluna) — respeita o mesmo
// filtro de busca que estiver ativo na tela, pra "marcar todos" agir só
// sobre o que está sendo mostrado no momento, não sobre clientes escondidos
// pela busca. 1 INSERT...SELECT só (mais rápido que upsert em laço).
async function setComunicarCentroCusto(empresaId, costCenterId, comunicar, search = '') {
  const params = [empresaId];
  const subAtivos = subqueryClientesAtivos(params, costCenterId);
  const termo = search ? `%${search}%` : null;
  params.push(termo, comunicar);

  const { rowCount } = await pool.query(
    `INSERT INTO sie_customers_comunicar (empresa_id, client_id, comunicar)
     SELECT $1, ativos.client_id, $${params.length}
     FROM ${subAtivos} ativos
     JOIN sie_customers sc ON sc.id = ativos.client_id AND sc.empresa_id = $1
     WHERE ($${params.length - 1}::text IS NULL OR sc.name ILIKE $${params.length - 1} OR sc.cpf ILIKE $${params.length - 1} OR sc.cnpj ILIKE $${params.length - 1})
     ON CONFLICT (empresa_id, client_id) DO UPDATE SET comunicar = EXCLUDED.comunicar, atualizado_em = NOW()`,
    params
  );
  return { atualizados: rowCount };
}

// Achata a mesma matriz Centro de Custo → Cliente da tela (respeitando os
// mesmos filtros de centro/busca) numa lista só, pra exportação em Excel —
// reaproveita as 2 funções já existentes acima em vez de duplicar o SQL:
// 1 chamada pra saber quais centros aparecem (mesmo universo/filtro/busca
// da tela) e, pra cada um, a lista completa de clientes ativos dele (sem
// paginação — `limit` bem alto no lugar da página da tela). N+1 de
// propósito aqui: é uma ação de exportar, não um caminho quente, e a
// quantidade de centros de custo é sempre pequena (dezenas, não milhares).
async function listClientesParaExportacao(empresaId, { costCenterIds, search = '' } = {}) {
  const centros = await getResumoPorCentroCusto(empresaId, { costCenterIds, search });
  const linhas = [];
  for (const centro of centros) {
    const { data } = await listClientesPorCentroCusto(empresaId, centro.cost_center_id, {
      search,
      page: 1,
      limit: 100000,
    });
    for (const cliente of data) {
      linhas.push({ cost_center_name: centro.cost_center_name, ...cliente });
    }
  }
  return linhas;
}

module.exports = {
  sincronizar,
  getResumo,
  getResumoPorCentroCusto,
  listClientesPorCentroCusto,
  listClientesParaExportacao,
  setComunicar,
  setComunicarCentroCusto,
};
