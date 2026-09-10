const { siengeFetch } = require('../../utils/siengeFetch');

// bulk-data/v1/income: contas a receber (parcelas de cliente) — base bruta
// usada pra clusterizar o cliente no Motor de Risco. Datas bem abertas de
// propósito (mesmo intervalo passado pelo usuário): queremos o histórico
// inteiro, não só um período.
const START_DATE = '2000-01-01';
const END_DATE = '2050-12-31';

function buildIncomeUrl(tenant) {
  return `https://api.sienge.com.br/${tenant}/public/api/bulk-data/v1/income`;
}

async function fetchPage({ tenant, username, password, offset, limit }) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const params = new URLSearchParams({
    startDate: START_DATE,
    endDate: END_DATE,
    selectionType: 'D',
    offset: String(offset),
    limit: String(limit),
  });
  const url = `${buildIncomeUrl(tenant)}?${params.toString()}`;

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
      `A API do Sienge retornou erro ao buscar o contas a receber (status ${response.status})${detail ? `: ${detail}` : ''}.`
    );
    e.status = 502;
    e.expose = true;
    throw e;
  }

  return response.json();
}

// Testado ao vivo: diferente da v1 comum, a bulk-data do Sienge NÃO pagina
// por offset/limit — ela IGNORA os dois e devolve sempre o recorte inteiro
// do período (startDate/endDate) numa resposta só, em `data` (não
// `results`), sem `resultSetMetadata`. Confirmado pedindo `limit=200` e
// recebendo de volta as 9448 linhas inteiras do tenant de teste. Por isso é
// sempre uma chamada HTTP só, nunca um laço — chamar de novo com offset
// maior devolveria a mesma coisa inteira outra vez, só desperdiçando tempo
// e martelando a API à toa (é exatamente esse laço que já causou dois
// incidentes de teste travando essa sincronização por minutos).
async function fetchAllIncome({ tenant, username, password, onProgress }) {
  const page = await fetchPage({ tenant, username, password, offset: 0, limit: 1000 });
  const results = Array.isArray(page?.data) ? page.data : [];
  onProgress?.({ paginaAtual: 1, totalPaginas: 1 });
  return results;
}

module.exports = { fetchAllIncome };
