// API REST nova do Prevision (nov/2026): token JWT da empresa (Bearer), sem validade. A lista de obras
// já usa ela; o código da conta e o dashboard ainda estão na API antiga (GraphQL / dashboards-api) e
// migram nos próximos passos.
const REST_URL = 'https://api.prevision.com.br/construction/api/v1';
const GRAPHQL_URL = 'https://api.prevision.com.br/graphql';
const DASHBOARDS_URL =
  'https://southamerica-east1-prevision-306716.cloudfunctions.net/dashboards-api';

const ME_QUERY = `
  query Me {
    me {
      id
      name
    }
  }
`;

// Sem tempo limite, uma chamada que o Prevision não responde prenderia a rotina do Monitor pra sempre.
const TIMEOUT_MS = 60_000;

const { sinalDeCancelamento, erroCancelada } = require('../../utils/execucaoCancelavel');

function apiError(message) {
  const e = new Error(message);
  e.status = 502;
  e.expose = true;
  return e;
}

// Tempo limite de cada chamada + o "Parar" do Monitor de Integrações (execucaoCancelavel.js).
function sinal() {
  const limite = AbortSignal.timeout(TIMEOUT_MS);
  const cancelar = sinalDeCancelamento();
  return cancelar ? AbortSignal.any([limite, cancelar]) : limite;
}

// fetch com o sinal; erro de rede/tempo vira a mensagem da integração (ou o cancelamento).
async function chamar(url, opcoes) {
  try {
    return await fetch(url, { ...opcoes, signal: sinal() });
  } catch (err) {
    if (sinalDeCancelamento()?.aborted) throw erroCancelada();
    throw apiError(`Não foi possível conectar à API do Prevision${err?.name === 'TimeoutError' ? ' (tempo limite excedido)' : ''}.`);
  }
}

async function fetchCompanyId(apiKey) {
  const response = await chamar(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      UserAuthorization: `token ${apiKey}`,
    },
    body: JSON.stringify({ query: ME_QUERY }),
  });

  if (!response.ok) {
    throw apiError(`A API do Prevision retornou erro (status ${response.status}) ao identificar a conta.`);
  }

  const body = await response.json();
  if (body.errors) {
    throw apiError(`A API do Prevision retornou erro: ${body.errors[0]?.message || 'erro desconhecido'}.`);
  }

  const companyId = body?.data?.me?.id;
  if (!companyId) {
    throw apiError('Não foi possível identificar a conta (company_id) no Prevision.');
  }
  return companyId;
}

// Token da API REST: JWT (três partes base64url separadas por ponto, começa com "eyJ"). Aceita o
// "Bearer " colado junto (vem assim do curl da documentação) e espaços nas pontas.
function normalizarToken(valor) {
  return String(valor || '').trim().replace(/^bearer\s+/i, '').trim();
}

function ehTokenRest(token) {
  return /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(token);
}

function tokenRest(apiKey) {
  const token = normalizarToken(apiKey);
  if (!ehTokenRest(token)) {
    const e = new Error(
      'O token do Prevision cadastrado nesta empresa não é o da API nova. Gere o token da API no Prevision e cadastre em Integrações › Prevision.'
    );
    e.status = 400;
    e.expose = true;
    throw e;
  }
  return token;
}

// Erro da API REST: 401/403 = token recusado (status 502 aqui — um 401 nosso derrubaria a sessão no front).
function erroRest(response, acao) {
  if (response.status === 401 || response.status === 403) {
    return apiError(`O Prevision recusou o token desta empresa (status ${response.status}). Confira o token em Integrações › Prevision.`);
  }
  return apiError(`A API do Prevision retornou erro (status ${response.status}) ao ${acao}.`);
}

// GET /projects → { projects: [{ id, name }] }, todas as obras da conta de uma vez (sem paginação).
async function fetchProjects(apiKey) {
  const response = await chamar(`${REST_URL}/projects`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${tokenRest(apiKey)}` },
  });
  if (!response.ok) throw erroRest(response, 'listar as obras');

  const body = await response.json().catch(() => null);
  if (!Array.isArray(body?.projects)) {
    throw apiError('A API do Prevision devolveu a lista de obras num formato inesperado.');
  }
  return body.projects.map((p) => ({ id: String(p.id), name: p.name }));
}

async function fetchDashboard({ apiKey, companyId, projectId, primary }) {
  const body = {
    dashboard: 'default',
    resource: 'detailed',
    view_type: 'percentage',
    dashboard_type: 'economic',
    primary,
    filtered_floor_ids: [],
    filtered_service_ids: [],
    filtered_total_cost: true,
    month_closure_type: 'last_day',
    month_closure_fixed_day: null,
    company_id: companyId,
    project_id: String(projectId),
  };

  const response = await chamar(DASHBOARDS_URL, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Token token=${apiKey}`,
      'User-Authorization': apiKey,
      'X-Api-Key': apiKey,
      Locale: 'pt-BR',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw apiError(
      `A API do Prevision retornou erro (status ${response.status}) para o projeto ${projectId}.`
    );
  }

  const data = await response.json();
  return data && Object.keys(data).length > 0 ? data : null;
}

module.exports = { fetchCompanyId, fetchProjects, fetchDashboard, normalizarToken, ehTokenRest };
