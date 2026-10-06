const { Client } = require('pg');
const pool = require('../../config/db');
const actioonService = require('../integracoes-actioon/actioon.service');
const bancoDadosService = require('../integracoes-banco-dados/bancoDados.service');

const CONEXAO_TIME_TRACKER = 'Time Tracker';
const CONEXAO_FINANCEIRO = 'Financeiro';

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
// quatro consultas (evita abrir várias conexões por carregamento do relatório).
// - "Duração": dias corridos desde a data_assinatura de cada empreendimento (client_id) até
//   hoje. Sem essa data (empreendimento não veio na consulta) a duração fica null.
// - M²/Unidades/VGV Geral: client_related_products liga 1:1 (confirmado — sem duplicidade)
//   product_client_id ao mesmo client_id usado em todo o resto do relatório.
// - "VGV Masa": a fatia do VGV que cabe à Masa como parceira (client_partnerships) — só a
//   parceria da própria Masa (nome_parceiro contém "MASA") e só a linha do empreendimento em si
//   (produto_relacionado_id nulo — parcerias de um produto específico ficam de fora, pedido do
//   usuário). Também 1:1 (confirmado — sem duplicidade). "% Masa" é o próprio
//   percentual_receitas_totais usado nessa conta (mostrado na coluna ao lado de Empreendimento).
// - "Horas Trabalhadas": soma de todo `duration` (segundos) de time_logs pro project_id daquele
//   empreendimento (client_id) — TODAS as tarefas já registradas, sem filtrar por micro etapa
//   (pedido explícito do usuário, pra não depender de casar nome de tarefa com task_type).
// - "Classificação" (Prioritários/Especiais/Críticos/Masa Operação) — mesma 1:1 (confirmado —
//   sem duplicidade) de client_related_products.product_client_id, só que juntando com
//   classifications pelo classificacao_id; usada só pra colorir a linha do empreendimento, sem
//   coluna própria na tabela.
// - "Agrupamento" (filtro do painel lateral da tela): client_details.agrupamento_id de cada
//   empreendimento (client_id), com o nome vindo de groupings. As OPÇÕES do filtro são todos os
//   agrupamentos ativos (groupings.active), tenham ou não empreendimento ligado (pedido do
//   usuário) — por isso é uma consulta à parte, não derivada da primeira.
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
  const vgvMasaPorCliente = new Map(); // client_id -> vgv_masa
  const percentualMasaPorCliente = new Map(); // client_id -> percentual_receitas_totais
  const segundosTrabalhadosPorCliente = new Map(); // client_id -> segundos somados (todo o time_logs)
  const classificacaoPorCliente = new Map(); // client_id -> nome da classificação
  const agrupamentoPorCliente = new Map(); // client_id -> agrupamento_id
  let agrupamentos = []; // [{ id, nome }] — todos os ativos, opções do filtro
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

    const parcerias = await client.query(`
      select
        cp.client_id,
        cp.percentual_receitas_totais,
        vgv * (cp.percentual_receitas_totais / 100) as vgv_masa
      from client_partnerships cp
      left join client_related_products crp on crp.product_client_id = cp.client_id
      where upper(nome_parceiro) like '%MASA%'
      and produto_relacionado_id is null
    `);
    for (const row of parcerias.rows) {
      vgvMasaPorCliente.set(row.client_id, row.vgv_masa != null ? Number(row.vgv_masa) : null);
      percentualMasaPorCliente.set(
        row.client_id,
        row.percentual_receitas_totais != null ? Number(row.percentual_receitas_totais) : null
      );
    }

    const logs = await client.query(`
      select project_id, sum(duration)::bigint as total_segundos
      from time_logs tl
      group by project_id
    `);
    for (const row of logs.rows) {
      segundosTrabalhadosPorCliente.set(row.project_id, Number(row.total_segundos));
    }

    const classificacoes = await client.query(`
      select
        crp.product_client_id,
        c.nome
      from client_related_products crp
      left join classifications c on c.id = crp.classificacao_id
      where c.nome is not null
    `);
    for (const row of classificacoes.rows) {
      classificacaoPorCliente.set(row.product_client_id, row.nome);
    }

    const agrupamentosPorCliente = await client.query(`
      select
        client_id,
        agrupamento_id,
        g.nome
      from client_details cd
      left join groupings g on g.id = cd.agrupamento_id
    `);
    for (const row of agrupamentosPorCliente.rows) {
      if (row.agrupamento_id != null) agrupamentoPorCliente.set(row.client_id, row.agrupamento_id);
    }

    const agrupamentosAtivos = await client.query(`
      select * from groupings
      where active = true
      order by nome
    `);
    agrupamentos = agrupamentosAtivos.rows.map((row) => ({ id: row.id, nome: row.nome }));
  } catch {
    throw badRequest('Não foi possível conectar ao banco "Time Tracker".');
  } finally {
    await client.end().catch(() => {});
  }
  return {
    duracaoPorCliente,
    produtoPorCliente,
    vgvMasaPorCliente,
    percentualMasaPorCliente,
    segundosTrabalhadosPorCliente,
    classificacaoPorCliente,
    agrupamentoPorCliente,
    agrupamentos,
  };
}

// "Contas Pagas" e "Contas a Pagar" — soma das despesas (cabecalho_evento_main.type = 'EXPENSE')
// rateadas por centro de custo, ligado ao empreendimento por NOME (act_clients.name = nome do
// centro de custo) — não é o mesmo client_id da Actioon nem do Time Tracker, act_clients é o
// cadastro de clientes de dentro do banco "Financeiro" (conexão própria, empresa Masa). Cada
// evento que tem rateio usa o valor rateado (val_rateio); sem rateio, usa o valor cheio do evento
// (val_evento). Já vem agrupado por client_id na própria query. As duas colunas usam a MESMA
// query, só muda o status do evento:
// - Contas Pagas: ACQUITTED/CONCILIATED (baixada ou conciliada).
// - Contas a Pagar: PENDING/OVERDUE (em aberto, vencida ou não).
const SQL_CONTAS_POR_CLIENTE = `
      select
        sum(val_rateio) as valor,
        ac.id as client_id
      from (
        select
          case
            when qtd_rateio = 1 then val_evento
            when qtd_rateio > 1 then val_rateio
          end val_rateio,
          nom_centro_custo
        from (
          select
            count(*) over (partition by cem.id_original) as qtd_rateio,
            cem.negotiator_name as nom_favorecido,
            deccr.value as val_rateio,
            cem.value as val_evento,
            coalesce(coalesce(deccr.cost_center, cem.cost_center_name), 'TRANSFERÊNCIAS TRANSITÓRIAS') as nom_centro_custo
          from cabecalho_evento_main cem
          left join detalhe_evento_installment dei on dei.id_original = cem.installment_id
          left join detalhe_evento_acquittance dea on dea.installment_fk = dei.id
          left join detalhe_evento_event dee on dee.installment_fk = dei.id
          left join detalhe_evento_categories_ratio decr on decr.event_fk = dee.id
          left join detalhe_evento_cost_centers_ratio deccr on deccr.categories_ratio_fk = decr.id
          where cem.type = 'EXPENSE'
          and coalesce(deccr.cost_center, cem.cost_center_name) is not null
          and cem.status = any($1)
        ) t1
        where t1.nom_centro_custo <> 'TRANSFERÊNCIAS TRANSITÓRIAS'
      ) t2
      left join act_clients ac on ac."name" = nom_centro_custo
      where ac.id is not null
      group by nom_centro_custo, ac.id
    `;
const STATUS_CONTAS_PAGAS = ['ACQUITTED', 'CONCILIATED'];
const STATUS_CONTAS_A_PAGAR = ['OVERDUE', 'PENDING'];

async function buscarContasPorCliente() {
  const empresaId = await getEmpresaMasaId();
  const credenciais = await bancoDadosService.getCredenciaisPorConexao(empresaId, CONEXAO_FINANCEIRO);
  if (!credenciais) throw badRequest('Nenhuma conexão "Financeiro" ativa cadastrada para a Masa.');

  const client = new Client({
    host: credenciais.host,
    port: credenciais.porta,
    database: credenciais.banco,
    user: credenciais.usuario,
    password: credenciais.senha,
    ssl: credenciais.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 8000,
  });

  const somarPorStatus = async (status) => {
    const { rows } = await client.query(SQL_CONTAS_POR_CLIENTE, [status]);
    const porCliente = new Map(); // client_id -> valor
    for (const row of rows) {
      porCliente.set(Number(row.client_id), row.valor != null ? Number(row.valor) : null);
    }
    return porCliente;
  };

  try {
    await client.connect();
    const contasPagasPorCliente = await somarPorStatus(STATUS_CONTAS_PAGAS);
    const contasAPagarPorCliente = await somarPorStatus(STATUS_CONTAS_A_PAGAR);
    return { contasPagasPorCliente, contasAPagarPorCliente };
  } catch {
    throw badRequest('Não foi possível conectar ao banco "Financeiro".');
  } finally {
    await client.end().catch(() => {});
  }
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

  const [
    fasesRaw,
    clientsRaw,
    taskTypesRaw,
    actions,
    {
      duracaoPorCliente,
      produtoPorCliente,
      vgvMasaPorCliente,
      percentualMasaPorCliente,
      segundosTrabalhadosPorCliente,
      classificacaoPorCliente,
      agrupamentoPorCliente,
      agrupamentos,
    },
    { contasPagasPorCliente, contasAPagarPorCliente },
  ] = await Promise.all([
    buscarJson(ACTIOON_ACTION_TYPES_URL, token, 'Não foi possível buscar as fases na Actioon.'),
    buscarJson(ACTIOON_CLIENTS_URL, token, 'Não foi possível buscar os empreendimentos na Actioon.'),
    buscarJson(ACTIOON_TASK_TYPES_URL, token, 'Não foi possível buscar as micro etapas na Actioon.'),
    buscarTodasActions(token),
    buscarDadosTimeTracker(),
    buscarContasPorCliente(),
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

  // Agrupa os empreendimentos dentro da fase onde ficaram mais avançados.
  const empreendimentosPorFaseId = new Map();
  for (const [clienteId, { itemId: faseId }] of faseMaisAvancadaPorCliente) {
    const cliente = clientePorId.get(clienteId);
    if (!cliente) continue; // client_id de uma action que não existe (mais) em /api/clients
    const microEtapa = microEtapaMaisAvancadaPorCliente.get(clienteId);
    const produto = produtoPorCliente.get(clienteId);
    if (!empreendimentosPorFaseId.has(faseId)) empreendimentosPorFaseId.set(faseId, []);
    empreendimentosPorFaseId.get(faseId).push({
      id: cliente.id,
      name: cliente.name,
      order: cliente.order,
      microEtapaAtual: microEtapa ? taskTypePorId.get(microEtapa.itemId)?.name || null : null,
      duracaoDias: duracaoPorCliente.get(clienteId) ?? null,
      areaM2: produto?.areaM2 ?? null,
      unidades: produto?.unidades ?? null,
      vgvGeral: produto?.vgvGeral ?? null,
      vgvMasa: vgvMasaPorCliente.get(clienteId) ?? null,
      percentualMasa: percentualMasaPorCliente.get(clienteId) ?? null,
      segundosTrabalhados: segundosTrabalhadosPorCliente.get(clienteId) ?? null,
      contasPagas: contasPagasPorCliente.get(clienteId) ?? null,
      contasAPagar: contasAPagarPorCliente.get(clienteId) ?? null,
      classificacao: classificacaoPorCliente.get(clienteId) ?? null,
      agrupamentoId: agrupamentoPorCliente.get(clienteId) ?? null,
    });
  }
  for (const lista of empreendimentosPorFaseId.values()) {
    lista.sort((a, b) => a.order - b.order);
  }

  const fases = [...fasesRaw]
    .sort((a, b) => a.order - b.order)
    .map((fase) => ({
      id: fase.id,
      name: fase.name,
      order: fase.order,
      // `order` do empreendimento só serve pra ordenar acima — não vai pra resposta.
      empreendimentos: (empreendimentosPorFaseId.get(fase.id) || []).map(({ order, ...empreendimento }) => empreendimento),
    }));

  return { fases, agrupamentos };
}

module.exports = { getEmpresaMasaId, listMatriz };
