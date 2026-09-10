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

function apiError(message) {
  const e = new Error(message);
  e.status = 502;
  e.expose = true;
  return e;
}

async function fetchCompanyId(apiKey) {
  let response;
  try {
    response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        UserAuthorization: `token ${apiKey}`,
      },
      body: JSON.stringify({ query: ME_QUERY }),
    });
  } catch {
    throw apiError('Não foi possível conectar à API do Prevision.');
  }

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
    let response;
    try {
      response = await fetch(GRAPHQL_URL, {
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
    } catch {
      throw apiError('Não foi possível conectar à API do Prevision.');
    }

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

  let response;
  try {
    response = await fetch(DASHBOARDS_URL, {
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
  } catch {
    throw apiError('Não foi possível conectar à API do Prevision.');
  }

  if (!response.ok) {
    throw apiError(
      `A API do Prevision retornou erro (status ${response.status}) para o projeto ${projectId}.`
    );
  }

  const data = await response.json();
  return data && Object.keys(data).length > 0 ? data : null;
}

module.exports = { fetchCompanyId, fetchProjects, fetchDashboard };
