const { siengeFetch } = require('../../utils/siengeFetch');

// Inspirado no script de referência _sie_sales_contracts.py: pagina pelo
// resultSetMetadata.count da primeira resposta, offset/limit fixo de 200,
// e Basic Auth (mesmo padrão dos outros clientes Sienge do projeto).
const PAGE_LIMIT = 200;

function buildContractsUrl(tenant) {
  return `https://api.sienge.com.br/${tenant}/public/api/v1/sales-contracts`;
}

async function fetchPage({ tenant, username, password, offset }) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const url = `${buildContractsUrl(tenant)}?limit=${PAGE_LIMIT}&offset=${offset}`;

  const response = await siengeFetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'User-Agent': 'HorizonFin/1.0 (+https://horizonfin.local)',
    },
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.message || body?.error || '';
    } catch {
      // resposta sem corpo JSON legível — segue sem detalhe
    }

    const e = new Error(
      `A API do Sienge retornou erro ao buscar contratos (status ${response.status})${detail ? `: ${detail}` : ''}.`
    );
    e.status = 502;
    e.expose = true;
    throw e;
  }

  return response.json();
}

// `onProgress`, se informado, é chamado depois de cada página buscada com
// `{ paginaAtual, totalPaginas }` — usado pra desenhar uma barra de
// progresso no log de atualização (ver progressoSincronizacao.js). A API
// pagina por offset/limit, sem número de página explícito, então a página
// atual é derivada do offset.
async function fetchAllContracts({ tenant, username, password, onProgress }) {
  const all = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const page = await fetchPage({ tenant, username, password, offset });
    const results = Array.isArray(page?.results) ? page.results : [];
    total = Number(page?.resultSetMetadata?.count ?? results.length);

    all.push(...results);

    const totalPaginas = Math.max(1, Math.ceil(total / PAGE_LIMIT));
    const paginaAtual = Math.floor(offset / PAGE_LIMIT) + 1;
    onProgress?.({ paginaAtual, totalPaginas });

    if (results.length === 0) break;
    offset += PAGE_LIMIT;
  }

  return all;
}

// PATCH /sales-contracts/{id} — atualiza campos do contrato direto na API
// do Sienge (não é um upsert de sincronização, é uma edição pontual feita
// pelo usuário na tela). `body` é enviado como veio (ex.: só
// `{ financialInstitutionNumber }`), sem preencher os demais campos do
// endpoint que não estamos editando.
async function updateContract({ tenant, username, password, contractId, body }) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const url = `${buildContractsUrl(tenant)}/${contractId}`;

  const response = await siengeFetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'HorizonFin/1.0 (+https://horizonfin.local)',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const respBody = await response.json();
      detail = respBody?.message || respBody?.error || '';
    } catch {
      // resposta sem corpo JSON legível — segue sem detalhe
    }

    const e = new Error(
      `A API do Sienge retornou erro ao atualizar o contrato (status ${response.status})${detail ? `: ${detail}` : ''}.`
    );
    e.status = 502;
    e.expose = true;
    throw e;
  }
}

module.exports = { fetchAllContracts, updateContract };
