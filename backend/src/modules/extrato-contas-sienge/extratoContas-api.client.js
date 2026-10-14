const { siengeFetch } = require('../../utils/siengeFetch');

// v1/accounts-statements: extrato de UMA conta bancária (accountNumber + companyId), paginado de
// 200 em 200 — mesmo esquema de paginação de v1/checking-accounts (contas-bancarias-sienge). Base
// completa (pedido do usuário): de 01/01/2000 até o início do mês atual.
const PAGE_LIMIT = 200;
const START_DATE = '2000-01-01';

function buildUrl(tenant) {
  return `https://api.sienge.com.br/${tenant}/public/api/v1/accounts-statements`;
}

// 'AAAA-MM-01' do mês atual (relógio da aplicação).
function inicioDoMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

async function fetchPage({ tenant, username, password, accountNumber, companyId, endDate, offset }) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const params = new URLSearchParams({
    startDate: START_DATE,
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

// Todos os lançamentos da conta no período. `onPagina(paginaAtual, totalPaginas)` pro progresso.
async function fetchAllStatements({ tenant, username, password, accountNumber, companyId, endDate, onPagina }) {
  const todos = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const page = await fetchPage({ tenant, username, password, accountNumber, companyId, endDate, offset });
    const results = Array.isArray(page?.results) ? page.results : [];
    total = Number(page?.resultSetMetadata?.count ?? results.length);
    todos.push(...results);
    onPagina?.(Math.floor(offset / PAGE_LIMIT) + 1, Math.max(1, Math.ceil(total / PAGE_LIMIT)));
    if (results.length === 0) break;
    offset += PAGE_LIMIT;
  }
  return todos;
}

module.exports = { fetchAllStatements, inicioDoMesAtual };
