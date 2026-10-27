const { siengeFetch } = require('../../utils/siengeFetch');

// Mesma lógica de repasses-cef/sienge-contracts-api.client.js (pedido do usuário), no endpoint
// /units: pagina pelo resultSetMetadata.count da primeira resposta, offset incremental com limit
// fixo de 200, e Basic Auth.
const PAGE_LIMIT = 200;

function buildUnitsUrl(tenant) {
  return `https://api.sienge.com.br/${tenant}/public/api/v1/units`;
}

async function fetchPage({ tenant, username, password, offset }) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const url = `${buildUnitsUrl(tenant)}?limit=${PAGE_LIMIT}&offset=${offset}`;

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
      `A API do Sienge retornou erro ao buscar unidades (status ${response.status})${detail ? `: ${detail}` : ''}.`
    );
    e.status = 502;
    e.expose = true;
    throw e;
  }

  return response.json();
}

// `onProgress`, se informado, é chamado depois de cada página buscada com
// `{ paginaAtual, totalPaginas }` — barra de progresso no log de atualização (mesmo esquema dos
// contratos).
async function fetchAllUnits({ tenant, username, password, onProgress }) {
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

module.exports = { fetchAllUnits };
