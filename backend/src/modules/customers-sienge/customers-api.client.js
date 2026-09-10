const { siengeFetch } = require('../../utils/siengeFetch');

// public/api/v1/customers — diferente da bulk-data usada pelo income
// (income-api.client.js): esta aqui pagina de verdade por limit/offset,
// devolvendo `resultSetMetadata.count` (total) + `results` (a página).
const PAGE_LIMIT = 200;

function buildCustomersUrl(tenant) {
  return `https://api.sienge.com.br/${tenant}/public/api/v1/customers`;
}

async function fetchPage({ tenant, username, password, offset }) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const url = `${buildCustomersUrl(tenant)}?limit=${PAGE_LIMIT}&offset=${offset}`;

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
      `A API do Sienge retornou erro ao buscar os clientes (status ${response.status})${detail ? `: ${detail}` : ''}.`
    );
    e.status = 502;
    e.expose = true;
    throw e;
  }

  return response.json();
}

// Pagina de verdade (diferente da bulk-data do income) até acabar o total
// informado em resultSetMetadata.count — mesmo laço de
// centros-custo-sienge/sienge-api.client.js::fetchAllEnterprises.
async function fetchAllCustomers({ tenant, username, password, onProgress }) {
  const all = [];
  let offset = 0;
  let total = Infinity;
  let pagina = 0;

  while (offset < total) {
    const page = await fetchPage({ tenant, username, password, offset });
    const results = Array.isArray(page?.results) ? page.results : [];
    total = Number(page?.resultSetMetadata?.count ?? results.length);
    pagina += 1;

    all.push(...results);
    onProgress?.({ paginaAtual: pagina, totalPaginas: Math.max(1, Math.ceil(total / PAGE_LIMIT)) });

    if (results.length === 0) break;
    offset += PAGE_LIMIT;
  }

  return all;
}

module.exports = { fetchAllCustomers };
