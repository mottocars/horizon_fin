// API REST do Prevision (desde nov/2026 — a GraphQL e o dashboards-api antigos recusam o token de
// empresa): token JWT da empresa (Bearer), sem validade; o código da conta vem no próprio token (`oid`).
// - construction: a lista de obras;
// - construction-schedule: o avanço DIÁRIO de cada obra (curva S) e o IDP, por visão (primária/secundária).
const REST_URL = 'https://api.prevision.com.br/construction/api/v1';
const SCHEDULE_URL = 'https://api.prevision.com.br/construction-schedule/api/v1';

// Sempre o dashboard ECONÔMICO em percentual — o que o sistema sempre usou (bate com as curvas gravadas
// antes da troca). O `physical` é outra curva e devolve a mesma coisa nas duas visões.
const DASHBOARD_QUERY = 'view_type=percentage&dashboard_type=economic';

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

// Código da conta (company_id) no Prevision: a claim `oid` do token (só leitura do JWT, sem validar a
// assinatura — quem valida é o Prevision a cada chamada).
function companyIdDoToken(apiKey) {
  try {
    const payload = JSON.parse(Buffer.from(tokenRest(apiKey).split('.')[1], 'base64url').toString('utf8'));
    return payload?.oid != null ? String(payload.oid) : null;
  } catch {
    return null;
  }
}

// Erro da API REST (status 502 aqui — um 401 nosso derrubaria a sessão no front). 401/403 = recusado: o
// token, ou — nas rotas de uma obra — o projeto, que o Prevision também recusa com 401 quando o código não
// existe ou é de outra conta.
function erroRest(response, acao, recusado) {
  if (response.status === 401 || response.status === 403) {
    return apiError(
      recusado
        ? `${recusado} (status ${response.status})`
        : `O Prevision recusou o token desta empresa (status ${response.status}). Confira o token em Integrações › Prevision.`
    );
  }
  return apiError(`A API do Prevision retornou erro (status ${response.status}) ${acao}.`);
}

async function getJson(url, apiKey, acao, recusado) {
  const response = await chamar(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${tokenRest(apiKey)}` },
  });
  if (!response.ok) throw erroRest(response, acao, recusado);
  return response.json().catch(() => null);
}

const recusouProjeto = (projectId) =>
  `O Prevision recusou o projeto ${projectId}: confira o Código Prevision do centro de custo e o token em Integrações › Prevision`;

// GET /projects → { projects: [{ id, name }] }, todas as obras da conta de uma vez (sem paginação).
async function fetchProjects(apiKey) {
  const body = await getJson(`${REST_URL}/projects`, apiKey, 'ao listar as obras');
  if (!Array.isArray(body?.projects)) {
    throw apiError('A API do Prevision devolveu a lista de obras num formato inesperado.');
  }
  return body.projects.map((p) => ({ id: String(p.id), name: p.name }));
}

// GET /project/:id/dashboards/daily-progress → { lastMeasuredIn, progress: [{ date, base, expected,
// goal, realized }] }: o avanço de CADA DIA (não acumulado), do início ao fim da obra. Obra sem curva no
// Prevision (ainda sem planejamento) vem com `progress: []` → null.
async function fetchDailyProgress({ apiKey, projectId, primary }) {
  const url = `${SCHEDULE_URL}/project/${encodeURIComponent(projectId)}/dashboards/daily-progress?${DASHBOARD_QUERY}&primary=${primary}`;
  const body = await getJson(url, apiKey, `para o projeto ${projectId}`, recusouProjeto(projectId));
  if (!body || !Array.isArray(body.progress)) {
    throw apiError(`A API do Prevision devolveu o avanço do projeto ${projectId} num formato inesperado.`);
  }
  return body.progress.length ? body : null;
}

// GET /project/:id/dashboards/general-info → { idp }. A rota ignora o `primary`: devolve sempre o IDP da
// visão PRIMÁRIA (conferido em 18/11/2026) — por isso só a primária é buscada.
async function fetchIdp({ apiKey, projectId }) {
  const url = `${SCHEDULE_URL}/project/${encodeURIComponent(projectId)}/dashboards/general-info?${DASHBOARD_QUERY}&primary=true`;
  const body = await getJson(url, apiKey, `ao buscar o IDP do projeto ${projectId}`, recusouProjeto(projectId));
  const idp = Number(body?.idp);
  return body?.idp != null && Number.isFinite(idp) ? idp : null;
}

module.exports = {
  fetchProjects,
  fetchDailyProgress,
  fetchIdp,
  companyIdDoToken,
  tokenRest,
  normalizarToken,
  ehTokenRest,
};
