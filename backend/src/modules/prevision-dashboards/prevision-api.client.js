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

const PROJECTS_QUERY = `
  query Projects($first: Int, $after: String) {
    me {
      id
      name
      projectsPage(first: $first, after: $after) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          name
          area
          phase
        }
      }
    }
  }
`;

const PROJECTS_PAGE_SIZE = 50;
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

async function fetchProjects(apiKey) {
  const allProjects = [];
  let afterCursor = null;

  for (;;) {
    const response = await chamar(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        UserAuthorization: `token ${apiKey}`,
      },
      body: JSON.stringify({
        query: PROJECTS_QUERY,
        variables: { first: PROJECTS_PAGE_SIZE, after: afterCursor },
      }),
    });

    if (!response.ok) {
      throw apiError(`A API do Prevision retornou erro (status ${response.status}) ao listar projetos.`);
    }

    const body = await response.json();
    if (body.errors) {
      throw apiError(`A API do Prevision retornou erro: ${body.errors[0]?.message || 'erro desconhecido'}.`);
    }

    const projectsPage = body?.data?.me?.projectsPage;
    if (!projectsPage) {
      throw apiError('Não foi possível obter a lista de projetos no Prevision.');
    }

    allProjects.push(...projectsPage.nodes);

    if (!projectsPage.pageInfo?.hasNextPage) break;
    afterCursor = projectsPage.pageInfo.endCursor;
  }

  return allProjects;
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

module.exports = { fetchCompanyId, fetchProjects, fetchDashboard };
