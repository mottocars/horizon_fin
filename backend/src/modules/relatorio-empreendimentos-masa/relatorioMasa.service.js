const { Client } = require('pg');
const pool = require('../../config/db');
const actioonService = require('../integracoes-actioon/actioon.service');
const bancoDadosService = require('../integracoes-banco-dados/bancoDados.service');

const CONEXAO_TIME_TRACKER = 'Time Tracker';

const ACTIOON_ACTION_TYPES_URL = 'https://api.actioon.com.br/api/action_types';
const ACTIOON_CLIENTS_URL = 'https://api.actioon.com.br/api/clients';
const ACTIOON_ACTIONS_URL = 'https://api.actioon.com.br/api/actions';
const ACTIOON_TASK_TYPES_URL = 'https://api.actioon.com.br/api/task_types';

// Quantas páginas de /api/actions buscar em paralelo por vez — a Actioon ignora `per_page`
// (fixo em 25) e hoje tem ~1000 actions (~40 páginas); sequencial demoraria demais, tudo de
// uma vez seria agressivo demais com a API de terceiro.
const LOTE_PAGINAS_ACTIONS = 8;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// O `order` que /api/task_types devolve NÃO é confiável pra comparar task_types de fases
// diferentes — ex.: os da Fase 3 têm order 0-10, mais baixo que os da Fase 1 (27-36), mesmo a
// Fase 3 sendo mais avançada. O nome de todo task_type começa com o padrão real "major.minor"
// (ex.: "2.10 Anteprojeto validado..."), que é o sinal confiável de progressão — codifica como
// major*1000+minor (minor nunca passa de 2 dígitos hoje) pra virar um número comparável.
function chaveOrdemTaskType(nome) {
  const match = /^(\d+)\.(\d+)/.exec(nome || '');
  if (!match) return null;
  return parseInt(match[1], 10) * 1000 + parseInt(match[2], 10);
}

// Relatório exclusivo da Masa (pedido do usuário) — em vez de um
// empresa_id fixo no código, resolve pelo nome_fantasia (mais seguro
// contra o id mudar num banco recriado do zero).
async function getEmpresaMasaId() {
  const { rows } = await pool.query("SELECT id FROM empresas WHERE nome_fantasia = 'MASA' LIMIT 1");
  if (!rows[0]) throw badRequest('Empresa MASA não encontrada.');
  return rows[0].id;
}

async function buscarToken() {
  const empresaId = await getEmpresaMasaId();
  const credenciais = await actioonService.getCredenciaisAtivas(empresaId);
  if (!credenciais) throw badRequest('Nenhuma integração Actioon ativa cadastrada para a Masa.');
  return actioonService.login(credenciais.email, credenciais.senha);
}

async function buscarJson(url, token, mensagemErro) {
  let resposta;
  try {
    resposta = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
  } catch {
    throw badRequest('Não foi possível conectar à Actioon.');
  }
  if (!resposta.ok) throw badRequest(mensagemErro);
  return resposta.json();
}

// GET autenticado num endpoint simples (action_types/clients) — mesmo formato de retorno
// (lista de itens com id/name/order), sempre ordenado por `order` (não por nome nem id).
async function buscarListaOrdenada(url, token, mensagemErro) {
  const corpo = await buscarJson(url, token, mensagemErro);
  return [...corpo]
    .sort((a, b) => a.order - b.order)
    .map((item) => ({ id: item.id, name: item.name, order: item.order }));
}

// /api/actions é paginado (25 por página, ~40 páginas hoje) e não aceita `per_page` maior —
// busca a 1ª página pra saber quantas existem (`last_page`) e o resto em lotes paralelos.
async function buscarTodasActions(token) {
  const primeira = await buscarJson(ACTIOON_ACTIONS_URL, token, 'Não foi possível buscar as ações na Actioon.');
  const todas = [...primeira.data];
  const paginas = Array.from({ length: primeira.last_page - 1 }, (_, i) => i + 2);

  for (let i = 0; i < paginas.length; i += LOTE_PAGINAS_ACTIONS) {
    const lote = paginas.slice(i, i + LOTE_PAGINAS_ACTIONS);
    const resultados = await Promise.all(
      lote.map((pagina) =>
        buscarJson(`${ACTIOON_ACTIONS_URL}?page=${pagina}`, token, 'Não foi possível buscar as ações na Actioon.')
      )
    );
    for (const resultado of resultados) todas.push(...resultado.data);
  }

  return todas;
}

// Dados que não vêm da Actioon, e sim de um banco de terceiro: a conexão Postgres "Time
// Tracker", cadastrada em Integrações > Banco de Dados pra empresa Masa. Uma única conexão pras
// duas consultas (evita abrir 2 conexões por carregamento do relatório).
// - "Duração": dias corridos desde a data_assinatura de cada empreendimento (client_id) até
//   hoje. Sem essa data (empreendimento não veio na consulta) a duração fica null.
// - M²/Unidades/VGV Geral: client_related_products liga 1:1 (confirmado — sem duplicidade)
//   product_client_id ao mesmo client_id usado em todo o resto do relatório.
async function buscarDadosTimeTracker() {
  const empresaId = await getEmpresaMasaId();
  const credenciais = await bancoDadosService.getCredenciaisPorConexao(empresaId, CONEXAO_TIME_TRACKER);
  if (!credenciais) throw badRequest('Nenhuma conexão "Time Tracker" ativa cadastrada para a Masa.');

  const client = new Client({
    host: credenciais.host,
    port: credenciais.porta,
    database: credenciais.banco,
    user: credenciais.usuario,
    password: credenciais.senha,
    ssl: credenciais.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 8000,
  });

  const duracaoPorCliente = new Map(); // client_id -> dias desde a data_assinatura
  const produtoPorCliente = new Map(); // client_id -> { areaM2, unidades, vgvGeral }
  try {
    await client.connect();

    const assinaturas = await client.query(
      'select client_id, data_assinatura from client_details where data_assinatura is not null'
    );
    const hoje = new Date();
    for (const row of assinaturas.rows) {
      const dias = Math.floor((hoje - new Date(row.data_assinatura)) / (1000 * 60 * 60 * 24));
      duracaoPorCliente.set(row.client_id, dias);
    }

    const produtos = await client.query(
      'select product_client_id, tamanho_imovel_m2, numero_unidades, vgv from client_related_products crp'
    );
    for (const row of produtos.rows) {
      produtoPorCliente.set(row.product_client_id, {
        areaM2: row.tamanho_imovel_m2 != null ? Number(row.tamanho_imovel_m2) : null,
        unidades: row.numero_unidades,
        vgvGeral: row.vgv != null ? Number(row.vgv) : null,
      });
    }
  } catch {
    throw badRequest('Não foi possível conectar ao banco "Time Tracker".');
  } finally {
    await client.end().catch(() => {});
  }
  return { duracaoPorCliente, produtoPorCliente };
}

// Pra cada empreendimento (client_id), acha o item de maior `order` entre todas as ocorrências
// dele numa lista de "eventos" já resolvidos — mesma lógica usada tanto pra fase (a partir de
// action.action_type_id) quanto pra micro etapa (a partir de task.task_type_id), só que o
// chamador decide como extrair o clientId/itemId de cada evento.
function maisAvancadoPorCliente(eventos, ordemPorItemId, extrairClienteEItem) {
  const resultado = new Map(); // client_id -> { itemId, order }
  for (const evento of eventos) {
    const { clienteId, itemId } = extrairClienteEItem(evento);
    if (clienteId == null || itemId == null) continue;
    const order = ordemPorItemId.get(itemId);
    if (order == null) continue; // item que não está mais cadastrado na Actioon

    const atual = resultado.get(clienteId);
    if (!atual || order > atual.order) {
      resultado.set(clienteId, { itemId, order });
    }
  }
  return resultado;
}

// Monta a matriz completa: cada fase (nível 1) já vem com os empreendimentos (nível 2) que
// estão NELA — e só nela. Um empreendimento pode ter ações em várias fases (ex.: uma na Fase
// 1, outra na Fase 5); ele só aparece na mais avançada (maior `order`), nunca nas anteriores
// — cada `action` liga um `client_id` (empreendimento) a um `action_type_id` (fase), então
// pra cada empreendimento basta achar, entre todas as suas actions, a fase de maior order.
// Empreendimento sem nenhuma action (nunca apareceu em /api/actions) não aparece em nenhuma
// fase — não tem como saber onde colocá-lo.
//
// "Micro Etapa Atual" segue a mesma ideia, um nível mais fundo: cada `action` tem um array de
// `tasks`, e cada task pode ter um `task_type_id` — pra cada empreendimento, entre TODAS as
// tasks de TODAS as suas actions (não só as da fase mais avançada), acha o task_type de maior
// `order` e mostra o nome dele. Independente da conta de fase — um empreendimento pode ter uma
// micro etapa "adiantada" registrada numa action de uma fase mais antiga.
async function listMatriz() {
  const token = await buscarToken();

  const [fasesRaw, clientsRaw, taskTypesRaw, actions, { duracaoPorCliente, produtoPorCliente }] = await Promise.all([
    buscarJson(ACTIOON_ACTION_TYPES_URL, token, 'Não foi possível buscar as fases na Actioon.'),
    buscarJson(ACTIOON_CLIENTS_URL, token, 'Não foi possível buscar os empreendimentos na Actioon.'),
    buscarJson(ACTIOON_TASK_TYPES_URL, token, 'Não foi possível buscar as micro etapas na Actioon.'),
    buscarTodasActions(token),
    buscarDadosTimeTracker(),
  ]);

  const ordemPorFaseId = new Map(fasesRaw.map((fase) => [fase.id, fase.order]));
  // Só empreendimentos "raiz" (sem parent_id) — os com parent_id são sub-itens (ex.: lotes de
  // um condomínio, cadastros de teste) que não devem aparecer como uma linha própria da matriz.
  const clientePorId = new Map(
    clientsRaw.filter((cliente) => cliente.parent_id == null).map((cliente) => [cliente.id, cliente])
  );
  const taskTypePorId = new Map(taskTypesRaw.map((tt) => [tt.id, tt]));
  const ordemPorTaskTypeId = new Map(taskTypesRaw.map((tt) => [tt.id, chaveOrdemTaskType(tt.name)]));

  const faseMaisAvancadaPorCliente = maisAvancadoPorCliente(actions, ordemPorFaseId, (action) => ({
    clienteId: action.client_id,
    itemId: action.action_type_id,
  }));

  const tasks = actions.flatMap((action) => (action.tasks || []).map((task) => ({ ...task, client_id: action.client_id })));
  const microEtapaMaisAvancadaPorCliente = maisAvancadoPorCliente(tasks, ordemPorTaskTypeId, (task) => ({
    clienteId: task.client_id,
    itemId: task.task_type_id,
  }));

  // Quantas tarefas tem cada (empreendimento, task_type) e quantas delas já estão encerradas —
  // "encerrada" é só `actual_end_date` preenchida, nada de olhar status_id/progress (pedido do
  // usuário). Alimenta tanto a coluna "Qtd Tarefas" da micro etapa atual quanto a de cada
  // micro etapa do histórico (drilldown).
  const contagemPorClienteTaskType = new Map(); // "clienteId::taskTypeId" -> { total, fechadas }
  // Todo task_type que o empreendimento já teve alguma tarefa, pra montar o histórico do
  // drilldown (nível 2 de Micro Etapa Atual) — não só o vencedor.
  const taskTypeIdsPorCliente = new Map(); // clienteId -> Set<taskTypeId>
  for (const task of tasks) {
    if (task.client_id == null || task.task_type_id == null) continue;
    const chave = `${task.client_id}::${task.task_type_id}`;
    const atual = contagemPorClienteTaskType.get(chave) || { total: 0, fechadas: 0 };
    atual.total += 1;
    if (task.actual_end_date) atual.fechadas += 1;
    contagemPorClienteTaskType.set(chave, atual);

    if (!taskTypeIdsPorCliente.has(task.client_id)) taskTypeIdsPorCliente.set(task.client_id, new Set());
    taskTypeIdsPorCliente.get(task.client_id).add(task.task_type_id);
  }

  // "Qtd Tarefas Totais" — TODAS as tarefas do empreendimento, de toda ação, independente do
  // task_type (inclusive sem task_type_id nenhum) — diferente de "Qtd Tarefas" (essa sim por
  // micro etapa, ver contagemPorClienteTaskType acima). Pedido do usuário: manter as duas.
  const contagemTotalPorCliente = new Map(); // clienteId -> { total, fechadas }
  for (const task of tasks) {
    if (task.client_id == null) continue;
    const atual = contagemTotalPorCliente.get(task.client_id) || { total: 0, fechadas: 0 };
    atual.total += 1;
    if (task.actual_end_date) atual.fechadas += 1;
    contagemTotalPorCliente.set(task.client_id, atual);
  }

  // Histórico de micro etapas do empreendimento (drilldown da Micro Etapa Atual) — todas as
  // OUTRAS micro etapas em que ele já teve tarefa, cada uma com seu próprio "Qtd Tarefas",
  // ordenadas decrescente pelo prefixo major.minor (pedido do usuário: "se eu estou na 1.4,
  // mostre abaixo a 1.3, 1.2..."). A atual (a vencedora) não entra aqui — já aparece na linha
  // principal, repeti-la no histórico seria redundante.
  function montarHistorico(clienteId, taskTypeIdAtual) {
    const idsDoCliente = taskTypeIdsPorCliente.get(clienteId);
    if (!idsDoCliente) return [];
    return [...idsDoCliente]
      .filter((taskTypeId) => taskTypeId !== taskTypeIdAtual)
      .map((taskTypeId) => ({
        taskTypeId,
        chave: ordemPorTaskTypeId.get(taskTypeId),
        name: taskTypePorId.get(taskTypeId)?.name || null,
        contagem: contagemPorClienteTaskType.get(`${clienteId}::${taskTypeId}`),
      }))
      .filter((item) => item.chave != null && item.name)
      .sort((a, b) => b.chave - a.chave)
      .map((item) => ({
        name: item.name,
        qtdTarefas: item.contagem ? `${item.contagem.fechadas}/${item.contagem.total}` : null,
      }));
  }

  // Agrupa os empreendimentos dentro da fase onde ficaram mais avançados.
  const empreendimentosPorFaseId = new Map();
  for (const [clienteId, { itemId: faseId }] of faseMaisAvancadaPorCliente) {
    const cliente = clientePorId.get(clienteId);
    if (!cliente) continue; // client_id de uma action que não existe (mais) em /api/clients
    const microEtapa = microEtapaMaisAvancadaPorCliente.get(clienteId);
    const contagem = microEtapa ? contagemPorClienteTaskType.get(`${clienteId}::${microEtapa.itemId}`) : null;
    const contagemTotal = contagemTotalPorCliente.get(clienteId);
    const produto = produtoPorCliente.get(clienteId);
    if (!empreendimentosPorFaseId.has(faseId)) empreendimentosPorFaseId.set(faseId, []);
    empreendimentosPorFaseId.get(faseId).push({
      id: cliente.id,
      name: cliente.name,
      order: cliente.order,
      microEtapaAtual: microEtapa ? taskTypePorId.get(microEtapa.itemId)?.name || null : null,
      qtdTarefas: contagem ? `${contagem.fechadas}/${contagem.total}` : null,
      qtdTarefasTotais: contagemTotal ? `${contagemTotal.fechadas}/${contagemTotal.total}` : null,
      duracaoDias: duracaoPorCliente.get(clienteId) ?? null,
      areaM2: produto?.areaM2 ?? null,
      unidades: produto?.unidades ?? null,
      vgvGeral: produto?.vgvGeral ?? null,
      historicoMicroEtapas: microEtapa ? montarHistorico(clienteId, microEtapa.itemId) : [],
    });
  }
  for (const lista of empreendimentosPorFaseId.values()) {
    lista.sort((a, b) => a.order - b.order);
  }

  return [...fasesRaw]
    .sort((a, b) => a.order - b.order)
    .map((fase) => ({
      id: fase.id,
      name: fase.name,
      order: fase.order,
      empreendimentos: (empreendimentosPorFaseId.get(fase.id) || []).map(
        ({
          id,
          name,
          microEtapaAtual,
          qtdTarefas,
          qtdTarefasTotais,
          duracaoDias,
          areaM2,
          unidades,
          vgvGeral,
          historicoMicroEtapas,
        }) => ({
          id,
          name,
          microEtapaAtual,
          qtdTarefas,
          qtdTarefasTotais,
          duracaoDias,
          areaM2,
          unidades,
          vgvGeral,
          historicoMicroEtapas,
        })
      ),
    }));
}

module.exports = { listMatriz };
