const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1500;
const REGISTROS_POR_PAGINA = 500;
// Salvaguarda contra loop infinito se `total_de_paginas` vier inconsistente.
const MAX_PAGINAS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mesmo padrão de retry em 429 usado pro Sienge (ver ../../utils/siengeFetch.js)
// — mantido local aqui porque só esse client usa, por enquanto.
async function cvcrmFetch(url, options) {
  for (let tentativa = 0; ; tentativa++) {
    let response;
    try {
      response = await fetch(url, options);
    } catch {
      const e = new Error('Não foi possível conectar à API do Construtor de Vendas.');
      e.status = 502;
      e.expose = true;
      throw e;
    }

    if ((response.status === 429 || response.status === 503) && tentativa < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : BASE_DELAY_MS * 2 ** tentativa;
      await sleep(delayMs);
      continue;
    }

    return response;
  }
}

// Endpoint "cvdw" (data warehouse) do CVCRM — devolve um registro já
// achatado por reserva (sem objetos aninhados de titular/associados/
// comissões/contratos, ao contrário de /comercial/reservas) e traz
// paginação explícita via `total_de_paginas`, muito mais confiável do que
// inferir o fim pela página vir vazia. `situacao=todas` é obrigatório —
// sem ele a API só devolve as reservas de uma situação "ativa" padrão.
function buildUrl(tenant) {
  return `https://${tenant}.cvcrm.com.br/api/v1/cvdw/reservas`;
}

async function fetchPage({ tenant, email, token, pagina }) {
  const url = `${buildUrl(tenant)}?registros_por_pagina=${REGISTROS_POR_PAGINA}&situacao=todas&pagina=${pagina}`;

  const response = await cvcrmFetch(url, {
    headers: {
      accept: 'application/json',
      email,
      token,
    },
  });

  // Página sem mais registros — algumas variações da API do CVCRM sinalizam
  // isso com 204 sem corpo, em vez de erro.
  if (response.status === 204) return { dados: [], total_de_paginas: pagina };

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.message || body?.error || '';
    } catch {
      // resposta sem corpo JSON legível — segue sem detalhe
    }

    const e = new Error(
      `A API do Construtor de Vendas retornou erro (status ${response.status})${detail ? `: ${detail}` : ''}.`
    );
    e.status = 502;
    e.expose = true;
    throw e;
  }

  const raw = await response.text();
  if (!raw) return { dados: [], total_de_paginas: pagina };

  try {
    return JSON.parse(raw);
  } catch {
    const e = new Error(
      'A API do Construtor de Vendas devolveu uma resposta em formato inesperado (não é JSON válido). ' +
        'Verifique se o tenant configurado na integração está correto.'
    );
    e.status = 502;
    e.expose = true;
    throw e;
  }
}

// `onProgress`, se informado, é chamado depois de cada página buscada com
// `{ paginaAtual, totalPaginas }` — usado pra desenhar uma barra de
// progresso no log de atualização (ver progressoSincronizacao.js).
async function fetchAllReservas({ tenant, email, token, onProgress }) {
  const todas = [];
  let totalPaginas = 1;

  for (let pagina = 1; pagina <= totalPaginas && pagina <= MAX_PAGINAS; pagina++) {
    const page = await fetchPage({ tenant, email, token, pagina });
    const dados = Array.isArray(page?.dados) ? page.dados : [];
    todas.push(...dados);

    const totalDaResposta = Number(page?.total_de_paginas);
    if (Number.isFinite(totalDaResposta) && totalDaResposta > 0) totalPaginas = totalDaResposta;

    onProgress?.({ paginaAtual: pagina, totalPaginas });

    if (dados.length === 0) break;

    // Intervalo entre páginas — o script de referência do usuário usa 3s;
    // sem nenhuma pausa a API chegou a responder 503 num teste real.
    if (pagina < totalPaginas) await sleep(2000);
  }

  return todas;
}

module.exports = { fetchAllReservas };
