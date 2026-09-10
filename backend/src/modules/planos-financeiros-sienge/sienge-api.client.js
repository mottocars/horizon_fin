const { siengeFetch } = require('../../utils/siengeFetch');

function buildPaymentCategoriesUrl(tenant) {
  return `https://api.sienge.com.br/${tenant}/public/api/v1/payment-categories`;
}

async function fetchPaymentCategories({ tenant, username, password }) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  const response = await siengeFetch(buildPaymentCategoriesUrl(tenant), {
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

  const data = await response.json();

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

module.exports = { fetchPaymentCategories };
