const { siengeFetch } = require('../../utils/siengeFetch');

// v1/accounts-statements: extrato de UMA conta bancária (accountNumber + companyId), paginado de
// 200 em 200 — mesmo esquema de paginação de v1/checking-accounts (contas-bancarias-sienge). Base
// completa (pedido do usuário): de 01/01/2000 até HOJE (dia da atualização, em Brasília) — o realizado
// do mês atual vem até o dia da última atualização.
const PAGE_LIMIT = 200;
const START_DATE = '2000-01-01';

function buildUrl(tenant) {
  return `https://api.sienge.com.br/${tenant}/public/api/v1/accounts-statements`;
}

// 'AAAA-MM-DD' de hoje em Brasília (o servidor roda em UTC: depois das 21h já seria amanhã).
function hojeEmBrasilia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function fetchPage({ tenant, username, password, accountNumber, companyId, startDate = START_DATE, endDate, offset }) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const params = new URLSearchParams({
    startDate,
    endDate,
    accountNumber,
    companyId: String(companyId),
    limit: String(PAGE_LIMIT),
    offset: String(offset),
  });
  const response = await siengeFetch(`${buildUrl(tenant)}?${params.toString()}`, {
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
      detail = body?.message || body?.error || body?.developerMessage || '';
    } catch {
      // resposta sem corpo JSON legível — segue sem detalhe
    }
    const e = new Error(
      `A API do Sienge retornou erro ao buscar o extrato da conta ${accountNumber} (status ${response.status})${detail ? `: ${detail}` : ''}.`
    );
    e.status = 502;
    e.expose = true;
    throw e;
  }
  return response.json();
}

// Todos os lançamentos da conta no período (`startDate` vazio = desde 01/01/2000). `onPagina(paginaAtual,
// totalPaginas)` pro progresso.
async function fetchAllStatements({ tenant, username, password, accountNumber, companyId, startDate, endDate, onPagina }) {
  const todos = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const page = await fetchPage({ tenant, username, password, accountNumber, companyId, startDate: startDate || START_DATE, endDate, offset });
    const results = Array.isArray(page?.results) ? page.results : [];
    total = Number(page?.resultSetMetadata?.count ?? results.length);
    todos.push(...results);
    onPagina?.(Math.floor(offset / PAGE_LIMIT) + 1, Math.max(1, Math.ceil(total / PAGE_LIMIT)));
    if (results.length === 0) break;
    offset += PAGE_LIMIT;
  }
  return todos;
}

module.exports = { fetchAllStatements, hojeEmBrasilia };
