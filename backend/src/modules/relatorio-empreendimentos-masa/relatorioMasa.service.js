const pool = require('../../config/db');
const actioonService = require('../integracoes-actioon/actioon.service');

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

  const [fasesRaw, clientsRaw, taskTypesRaw, actions] = await Promise.all([
    buscarJson(ACTIOON_ACTION_TYPES_URL, token, 'Não foi possível buscar as fases na Actioon.'),
    buscarJson(ACTIOON_CLIENTS_URL, token, 'Não foi possível buscar os empreendimentos na Actioon.'),
    buscarJson(ACTIOON_TASK_TYPES_URL, token, 'Não foi possível buscar as micro etapas na Actioon.'),
    buscarTodasActions(token),
  ]);

  const ordemPorFaseId = new Map(fasesRaw.map((fase) => [fase.id, fase.order]));
  const clientePorId = new Map(clientsRaw.map((cliente) => [cliente.id, cliente]));
  const taskTypePorId = new Map(taskTypesRaw.map((tt) => [tt.id, tt]));
  const ordemPorTaskTypeId = new Map(taskTypesRaw.map((tt) => [tt.id, tt.order]));

  const faseMaisAvancadaPorCliente = maisAvancadoPorCliente(actions, ordemPorFaseId, (action) => ({
    clienteId: action.client_id,
    itemId: action.action_type_id,
  }));

  const tasks = actions.flatMap((action) => (action.tasks || []).map((task) => ({ ...task, client_id: action.client_id })));
  const microEtapaMaisAvancadaPorCliente = maisAvancadoPorCliente(tasks, ordemPorTaskTypeId, (task) => ({
    clienteId: task.client_id,
    itemId: task.task_type_id,
  }));

  // Agrupa os empreendimentos dentro da fase onde ficaram mais avançados.
  const empreendimentosPorFaseId = new Map();
  for (const [clienteId, { itemId: faseId }] of faseMaisAvancadaPorCliente) {
    const cliente = clientePorId.get(clienteId);
    if (!cliente) continue; // client_id de uma action que não existe (mais) em /api/clients
    const microEtapa = microEtapaMaisAvancadaPorCliente.get(clienteId);
    if (!empreendimentosPorFaseId.has(faseId)) empreendimentosPorFaseId.set(faseId, []);
    empreendimentosPorFaseId.get(faseId).push({
      id: cliente.id,
      name: cliente.name,
      order: cliente.order,
      microEtapaAtual: microEtapa ? taskTypePorId.get(microEtapa.itemId)?.name || null : null,
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
      empreendimentos: (empreendimentosPorFaseId.get(fase.id) || []).map(({ id, name, microEtapaAtual }) => ({
        id,
        name,
        microEtapaAtual,
      })),
    }));
}

module.exports = { listMatriz };
