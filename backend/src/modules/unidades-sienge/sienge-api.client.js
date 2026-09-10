const { siengeFetch } = require('../../utils/siengeFetch');

const PAGE_LIMIT = 200;

function buildUrl(tenant, resource) {
  return `https://api.sienge.com.br/${tenant}/public/api/v1/${resource}`;
}

async function fetchPage({ tenant, username, password, resource, offset }) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const url = `${buildUrl(tenant, resource)}?limit=${PAGE_LIMIT}&offset=${offset}`;

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
      `A API do Sienge retornou erro (status ${response.status})${detail ? `: ${detail}` : ''}.`
    );
    e.status = 502;
    e.expose = true;
    throw e;
  }

  return response.json();
}

async function fetchAllPages({ tenant, username, password, resource }) {
  const all = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const page = await fetchPage({ tenant, username, password, resource, offset });
    const results = Array.isArray(page?.results) ? page.results : [];
    total = Number(page?.resultSetMetadata?.count ?? results.length);

    all.push(...results);

    if (results.length === 0) break;
    offset += PAGE_LIMIT;
  }

  return all;
}

function fetchAllUnits({ tenant, username, password }) {
  return fetchAllPages({ tenant, username, password, resource: 'units' });
}

function fetchAllSalesContracts({ tenant, username, password }) {
  return fetchAllPages({ tenant, username, password, resource: 'sales-contracts' });
}

module.exports = { fetchAllUnits, fetchAllSalesContracts };
