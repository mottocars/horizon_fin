const { siengeFetch } = require('../../utils/siengeFetch');

// bulk-data/v1/business-budget: Orçamento Empresarial — base do cronograma de desembolso das
// naturezas "SIENGE - EMPRESARIAL DESEMBOLSO" no DFC Construtoras. Período sempre aberto (pedido
// do usuário): de 01/01/2000 a 31/12/2050. Só startDate e endDate — sem outros parâmetros.
const START_DATE = '2000-01-01';
const END_DATE = '2050-12-31';
// As requisições ao Sienge são limitadas: um timeout desperdiça a chamada inteira (mesma folga do
// contas a pagar).
const TIMEOUT_MS = 300_000;

function buildBusinessBudgetUrl(tenant) {
  return `https://api.sienge.com.br/${tenant}/public/api/bulk-data/v1/business-budget`;
}

async function fetchPage({ tenant, username, password }) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const params = new URLSearchParams({ startDate: START_DATE, endDate: END_DATE });
  const url = `${buildBusinessBudgetUrl(tenant)}?${params.toString()}`;

  const response = await siengeFetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'User-Agent': 'HorizonFin/1.0 (+https://horizonfin.local)',
    },
    timeoutMs: TIMEOUT_MS,
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
      `A API do Sienge retornou erro ao buscar o orçamento empresarial (status ${response.status})${detail ? `: ${detail}` : ''}.`
    );
    e.status = 502;
    e.expose = true;
    throw e;
  }

  return response.json();
}

// Mesmo comportamento das outras bulk-data (ver income-api.client.js): o período inteiro numa
// resposta só, em `data`. Sempre uma chamada HTTP só, nunca um laço.
async function fetchAllBusinessBudget({ tenant, username, password, onProgress }) {
  const page = await fetchPage({ tenant, username, password });
  const results = Array.isArray(page?.data) ? page.data : [];
  onProgress?.({ paginaAtual: 1, totalPaginas: 1 });
  return results;
}

module.exports = { fetchAllBusinessBudget };
