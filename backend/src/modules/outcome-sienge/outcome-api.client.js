const { siengeFetch } = require('../../utils/siengeFetch');
const { itensDoCampo } = require('../../utils/jsonEmPartes');

// bulk-data/v1/outcome: contas a pagar (parcelas de credor) — base do Aging a pagar do DFC
// Construtoras. Mesmo período aberto do income (histórico inteiro, por vencimento), com o saldo
// corrigido pelo indexador 2 na data do início do ano atual (pedido do usuário).
const START_DATE = '2000-01-01';
const END_DATE = '2050-12-31';
const CORRECTION_INDEXER_ID = '2';
// O contas a pagar é bem maior que o a receber, e as requisições ao Sienge são limitadas: um
// timeout desperdiça a chamada inteira. O tempo vale para a resposta inteira — download e gravação
// juntos, já que as parcelas são gravadas enquanto chegam (a da GENESIS leva uns 4 min só para baixar).
const TIMEOUT_MS = 30 * 60_000;

function buildOutcomeUrl(tenant) {
  return `https://api.sienge.com.br/${tenant}/public/api/bulk-data/v1/outcome`;
}

// 'AAAA-01-01' do ano atual.
function inicioDoAno() {
  return `${new Date().getFullYear()}-01-01`;
}

async function fetchPage({ tenant, username, password, offset, limit }) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const params = new URLSearchParams({
    startDate: START_DATE,
    endDate: END_DATE,
    selectionType: 'D',
    correctionIndexerId: CORRECTION_INDEXER_ID,
    correctionDate: inicioDoAno(),
    offset: String(offset),
    limit: String(limit),
  });
  const url = `${buildOutcomeUrl(tenant)}?${params.toString()}`;

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
      `A API do Sienge retornou erro ao buscar o contas a pagar (status ${response.status})${detail ? `: ${detail}` : ''}.`
    );
    e.status = 502;
    e.expose = true;
    throw e;
  }

  return response;
}

// Mesmo comportamento da bulk-data do income (ver income-api.client.js): ignora offset/limit e
// devolve o período inteiro numa resposta só, em `data`. Sempre uma chamada HTTP só, nunca um laço.
// A resposta é grande demais para response.json() (passa de 512 MB na GENESIS): devolve as parcelas
// uma a uma, conforme chegam (utils/jsonEmPartes.js). O erro da API (429, 4xx/5xx) sai antes da 1ª.
async function abrirOutcome({ tenant, username, password }) {
  const response = await fetchPage({ tenant, username, password, offset: 0, limit: 1000 });
  return itensDoCampo(response.body, 'data');
}

module.exports = { abrirOutcome };
