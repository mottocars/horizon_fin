const pool = require('../../config/db');
const {
  getLimiteVigente,
  listEtapasAtivasPorCluster,
  listEtapasComComunicacao,
} = require('../regua-cobranca/reguaCobranca.service');

const CLUSTERS_VALIDOS = ['novo', 'bom', 'duvidoso', 'mau', 'inad'];
const CLUSTERS_SCORE = ['novo', 'bom', 'duvidoso', 'mau'];

// Os 4 status de parcela (paga em dia/com atraso, inadimplente, a vencer) —
// mesmo vocabulário usado no badge do Nível 3 e no filtro "Tipo de Parcela"
// do topo da tela (ver gestaoParcelas.controller.js::statusParcelaSchema).
const STATUS_PARCELA_VALIDOS = ['em_dia', 'atraso', 'inadimplente', 'a_vencer'];

// Só parcelas com origin_id = 'CO' são contas a receber de verdade — mesma
// constante duplicada por módulo (de propósito, sem dependência cruzada)
// que cobrancaClusters.service.js e customers.service.js já usam.
const ORIGIN_ID_PADRAO = 'CO';

const UM_DIA_MS = 24 * 60 * 60 * 1000;

// Mesmos helpers de data UTC-safe de cobrancaClusters.service.js, duplicados
// aqui de propósito (mesma convenção de não compartilhar entre módulos).
function inicioDoDiaUTC(data) {
  const d = new Date(data);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function hojeComoDataUTC() {
  const agora = new Date();
  return new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()));
}

// diasEntre(due_date, hoje): negativo = antes do vencimento, positivo = dias
// de atraso — mesma convenção de sinal da régua de cobrança (D-5/D+5).
function diasEntre(dataMenor, dataMaior) {
  return Math.round((inicioDoDiaUTC(dataMaior).getTime() - inicioDoDiaUTC(dataMenor).getTime()) / UM_DIA_MS);
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// Etapas ativas dos 5 clusters (score + 'inad'), buscadas de uma vez só —
// evita 1 query por parcela quando for achar a etapa de cada uma (ver
// acharEtapaAtiva). Reaproveitado por buscarLinhasClassificadas (drilldown
// antigo) e pela coluna "Etapa" da versão nova (buscarParcelasComCluster/
// listParcelasPorTitulo).
async function carregarEtapasPorCluster(empresaId) {
  const etapasPorCluster = {};
  await Promise.all(
    CLUSTERS_VALIDOS.map(async (cluster) => {
      etapasPorCluster[cluster] = await listEtapasAtivasPorCluster(empresaId, cluster);
    })
  );
  return etapasPorCluster;
}

// Acha a etapa dona deste dia: a de maior `dias` ainda <= diasSigned (etapas
// já vêm ordenadas ASC — para no primeiro `dias > diasSigned`). A última
// etapa configurada nunca tem teto (nada com `dias` maior fecha a faixa
// dela) — pra cluster 'inad' isso é de propósito (parcela inadimplente fica
// presa na última etapa até ser quitada, nunca "sai" por passar dela — mesmo
// pedido do usuário: "ficar preso na última etapa até que este título seja
// quitado"). `null` quando o dia é anterior à 1ª etapa configurada (ou o
// cluster não tem etapa nenhuma) — fora do range da régua ainda.
function acharEtapaAtiva(etapasPorCluster, cluster, diasSigned) {
  const etapas = etapasPorCluster[cluster] || [];
  let etapa = null;
  for (const e of etapas) {
    if (e.dias <= diasSigned) etapa = e;
    else break;
  }
  return etapa;
}

const CLUSTERS_ZERADOS = { novo: 0, bom: 0, duvidoso: 0, mau: 0, inad: 0 };

// Coração do módulo: lê as parcelas em aberto direto da base crua
// (sie_income.due_date), classifica cada uma (cluster + etapa da régua) e
// devolve o array já enriquecido — os 3 níveis do drilldown (Centro de
// Custo/Cluster/Etapa) são só agrupamentos deste array em memória, sempre
// recalculados na hora (sem cache, ao contrário de cobranca_clientes_clusters).
//
// Diferente de cobrancaClusters.service.js: aqui a PARCELA é a unidade, não
// o cliente — uma parcela de um centro de custo rateado em N centros conta
// em cada um deles, e um cliente com parcelas em situações diferentes
// aparece uma vez por parcela, podendo repetir em clusters/etapas distintos.
//
// `search` (nome do cliente) filtra bem na origem — os 3 níveis do
// drilldown (Centro de Custo/Cluster/Etapa) chamam esta função, então um
// filtro aqui já refaz a matriz inteira dinamicamente (mesmo espírito do
// filtro de cliente da aba Clientes, ver ClientesTab.jsx/
// customers.service.js::getResumoPorCentroCusto).
async function buscarLinhasClassificadas(empresaId, { costCenterIds, search } = {}) {
  const limite = await getLimiteVigente(empresaId);
  const etapasPorCluster = await carregarEtapasPorCluster(empresaId);

  const { rows: clusterRows } = await pool.query(
    'SELECT client_id, cluster FROM cobranca_clientes_clusters WHERE empresa_id = $1',
    [empresaId]
  );
  const clusterPorCliente = new Map(clusterRows.map((r) => [String(r.client_id), r.cluster]));

  const params = [empresaId, ORIGIN_ID_PADRAO];
  let filtroCentro = '';
  if (Array.isArray(costCenterIds) && costCenterIds.length > 0) {
    params.push(costCenterIds);
    filtroCentro = ` AND cat.cost_center_id = ANY($${params.length}::bigint[])`;
  }

  // Universo restrito aos centros de custo com a etapa "Lançamento" já
  // registrada — mesmo critério de cobrancaClusters.service.js::
  // condicaoCentroCusto, só que como JOIN normal (não EXISTS), porque aqui
  // precisamos do cost_center_id/name de cada linha, não só confirmar que
  // ele existe. Uma parcela rateada em N centros gera N linhas aqui — é a
  // repetição esperada, não um bug.
  //
  // `sie_customers_comunicar` é o flag "Comunicar" da aba Clientes — sem
  // linha, o cliente é comunicado por padrão (`COALESCE(..., TRUE)`, mesmo
  // padrão de customers.service.js::getResumoPorCentroCusto). Cliente com
  // o flag desligado não entra nem aqui: não aparece em nenhum nível da
  // Gestão das Parcelas, é como se a parcela dele não existisse pra cobrança.
  const { rows } = await pool.query(
    `SELECT si.bill_id, si.installment_id, si.client_id, si.client_name, si.due_date,
            si.document_identification_name, si.document_number, si.installment_number,
            si.corrected_balance_amount, cat.cost_center_id, cat.cost_center_name
     FROM sie_income si
     JOIN sie_income_categorias cat
       ON cat.bill_id = si.bill_id AND cat.installment_id = si.installment_id AND cat.empresa_id = si.empresa_id
     JOIN centro_custo_etapas_historico h
       ON h.sienge_id = cat.cost_center_id AND h.empresa_id = cat.empresa_id AND h.data_inicio IS NOT NULL
     JOIN mascara_itens m
       ON m.id = h.mascara_item_id AND m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.descricao = 'Lançamento'
     LEFT JOIN sie_customers_comunicar com
       ON com.empresa_id = si.empresa_id AND com.client_id = si.client_id
     WHERE si.empresa_id = $1 AND si.origin_id = $2 AND si.corrected_balance_amount <> 0
       AND COALESCE(com.comunicar, TRUE) = TRUE${filtroCentro}`,
    params
  );

  const hoje = hojeComoDataUTC();
  const termo = (search || '').trim().toLowerCase();

  return rows
    .filter((row) => !termo || (row.client_name || '').toLowerCase().includes(termo))
    .map((row) => {
      const diasSigned = diasEntre(row.due_date, hoje);
      const clusterCliente = clusterPorCliente.get(String(row.client_id)) || 'novo';
      // Regra dura da Gestão das Parcelas: uma parcela vencida além do
      // parâmetro do Motor de Risco vira Inadimplência sozinha, mesmo que o
      // cliente tenha outras parcelas ainda dentro do prazo da régua — essas
      // continuam aparecendo no cluster normal dele (ver plano/pedido do
      // usuário: "a parcela não inadimplente em mau pagador, e a parcela
      // inadimplente em inadimplência").
      const cluster = diasSigned > limite ? 'inad' : clusterCliente;
      const etapa = acharEtapaAtiva(etapasPorCluster, cluster, diasSigned);

      // Fora do range da régua deste cluster (antes da 1ª etapa configurada,
      // ou cluster sem etapa nenhuma): a parcela ainda não é "cobrança
      // ativa" — não entra na matriz (nem um bucket "Sem etapa"). Descartada
      // aqui, não aparece em nenhum nível (Centro de Custo/Cluster/Etapa).
      if (!etapa) return null;

      return {
        bill_id: row.bill_id,
        installment_id: row.installment_id,
        client_id: row.client_id,
        client_name: row.client_name,
        due_date: row.due_date,
        document_identification_name: row.document_identification_name,
        document_number: row.document_number,
        installment_number: row.installment_number,
        corrected_balance_amount: Number(row.corrected_balance_amount),
        cost_center_id: row.cost_center_id,
        cost_center_name: row.cost_center_name,
        dias: diasSigned,
        cluster,
        etapa_id: etapa.id,
        etapa_nome: etapa.nome,
      };
    })
    .filter(Boolean);
}

const CLUSTERS_ZERADOS_SCORE = { novo: 0, bom: 0, duvidoso: 0, mau: 0 };

// Lê TODAS as parcelas do universo "Lançamento" — pagas E em aberto (ao
// contrário de buscarLinhasClassificadas, que só lê parcela em aberto e
// filtra pelo range da régua). É a base dos Níveis 1 e 2 da versão nova da
// tela ("vida do cliente, das parcelas pagas até as não pagas" — pedido do
// usuário): aqui o cluster do cliente vem direto de cobranca_clientes_clusters
// (mesmo dado de "Clusters de Clientes", sem a reclassificação "inad" por
// atraso que só existia pro drilldown antigo de régua).
//
// `status` é o MESMO 4 estados de listParcelasPorTitulo (em_dia/atraso/
// inadimplente/a_vencer, mesmo `limite` do Motor de Risco) — unificado aqui
// de propósito (antes os Níveis 1/2 usavam um critério mais simples,
// "vencida = passou do vencimento", enquanto só o Nível 3 usava o limite;
// isso fazia o valor "Vencido" lá em cima não bater com o que aparecia como
// "Inadimplente" ao abrir a parcela). `statusParcela` (opcional, array) é o
// filtro "Tipo de Parcela" do topo da tela — filtra bem na origem, antes de
// qualquer agregação, pra um Centro de Custo/cliente sem NENHUMA parcela do
// tipo escolhido simplesmente não aparecer em nenhum nível.
async function buscarParcelasComCluster(empresaId, { costCenterIds, search, statusParcela } = {}) {
  const limite = await getLimiteVigente(empresaId);
  const etapasPorCluster = await carregarEtapasPorCluster(empresaId);

  const params = [empresaId, ORIGIN_ID_PADRAO];
  let filtroCentro = '';
  if (Array.isArray(costCenterIds) && costCenterIds.length > 0) {
    params.push(costCenterIds);
    filtroCentro = ` AND cat.cost_center_id = ANY($${params.length}::bigint[])`;
  }
  let filtroBusca = '';
  if (search) {
    params.push(`%${search}%`);
    filtroBusca = ` AND si.client_name ILIKE $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT cat.cost_center_id, cat.cost_center_name,
            si.client_id, si.client_name, si.bill_id, si.installment_id,
            si.due_date, si.corrected_balance_amount, si.original_amount, si.installment_number,
            COALESCE(ccc.cluster, 'novo') AS cluster, pg.ultimo_pagamento
     FROM sie_income si
     JOIN sie_income_categorias cat
       ON cat.bill_id = si.bill_id AND cat.installment_id = si.installment_id AND cat.empresa_id = si.empresa_id
     JOIN centro_custo_etapas_historico h
       ON h.sienge_id = cat.cost_center_id AND h.empresa_id = cat.empresa_id AND h.data_inicio IS NOT NULL
     JOIN mascara_itens m
       ON m.id = h.mascara_item_id AND m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.descricao = 'Lançamento'
     LEFT JOIN cobranca_clientes_clusters ccc
       ON ccc.empresa_id = si.empresa_id AND ccc.client_id = si.client_id
     LEFT JOIN sie_customers_comunicar com
       ON com.empresa_id = si.empresa_id AND com.client_id = si.client_id
     LEFT JOIN (
       SELECT bill_id, installment_id, MAX(payment_date) AS ultimo_pagamento
       FROM sie_income_recebimentos
       WHERE empresa_id = $1
       GROUP BY bill_id, installment_id
     ) pg ON pg.bill_id = si.bill_id AND pg.installment_id = si.installment_id
     WHERE si.empresa_id = $1 AND si.origin_id = $2
       AND COALESCE(com.comunicar, TRUE) = TRUE${filtroCentro}${filtroBusca}`,
    params
  );

  const hoje = hojeComoDataUTC();
  const filtroStatus = Array.isArray(statusParcela) && statusParcela.length > 0 ? new Set(statusParcela) : null;

  return rows
    .map((row) => {
      const saldoAberto = Number(row.corrected_balance_amount) || 0;
      const paga = saldoAberto === 0;
      const diasSigned = diasEntre(row.due_date, hoje);
      let status;
      if (paga) {
        status = row.ultimo_pagamento && new Date(row.ultimo_pagamento) > new Date(row.due_date) ? 'atraso' : 'em_dia';
      } else if (diasSigned > limite) {
        status = 'inadimplente';
      } else {
        status = 'a_vencer';
      }

      // Etapa só existe pra parcela em aberto (vencida ou a vencer) — pago
      // não tem "etapa de cobrança" nenhuma (pedido do usuário: "títulos em
      // aberto, vencidos e a vencer"). Mesmo roteamento de cluster→régua de
      // buscarLinhasClassificadas: inadimplente usa a régua 'inad', o resto
      // usa a régua do cluster de score do cliente. `null` quando o dia
      // ainda está fora do range configurado da régua (parcela futura demais
      // pra já ter entrado em cobrança ativa).
      let etapaNome = null;
      if (!paga) {
        const clusterRegua = status === 'inadimplente' ? 'inad' : row.cluster;
        const etapa = acharEtapaAtiva(etapasPorCluster, clusterRegua, diasSigned);
        etapaNome = etapa?.nome ?? null;
      }

      return {
        cost_center_id: row.cost_center_id,
        cost_center_name: row.cost_center_name,
        client_id: row.client_id,
        client_name: row.client_name,
        bill_id: row.bill_id,
        installment_id: row.installment_id,
        due_date: row.due_date,
        installment_number: row.installment_number,
        cluster: row.cluster,
        status,
        etapa_nome: etapaNome,
        valor_original: Number(row.original_amount) || 0,
        saldo_aberto: saldoAberto,
      };
    })
    .filter((linha) => !filtroStatus || filtroStatus.has(linha.status));
}

// Nível 1 (Centro de Custo, versão nova): 1 linha por centro de custo do
// universo "Lançamento" (mesmo critério de sempre), com a contagem de
// CLIENTES (não parcelas) por cluster — mesmos 4 clusters de "Clusters de
// Clientes" (ver ClustersCobranca/constantes.js) — mais os 3 valores
// agregados (pago/vencido/a vencer) e o total de clientes do centro. Centro
// sem nenhum cliente com parcela (paga ou aberta) não aparece — mesmo
// critério aplicado em cobrancaClusters.service.js::getResumoPorCentroCusto.
async function getResumoPorCentroCusto(empresaId, filtros = {}) {
  const linhas = await buscarParcelasComCluster(empresaId, filtros);

  const porCentro = new Map();
  for (const linha of linhas) {
    const chave = String(linha.cost_center_id);
    if (!porCentro.has(chave)) {
      porCentro.set(chave, {
        cost_center_id: linha.cost_center_id,
        cost_center_name: linha.cost_center_name,
        clientesPorCluster: { novo: new Set(), bom: new Set(), duvidoso: new Set(), mau: new Set() },
        valor_pago: 0,
        valor_vencido: 0,
        valor_a_vencer: 0,
      });
    }
    const centro = porCentro.get(chave);
    const cluster = CLUSTERS_SCORE.includes(linha.cluster) ? linha.cluster : 'novo';
    centro.clientesPorCluster[cluster].add(String(linha.client_id));

    if (linha.status === 'em_dia' || linha.status === 'atraso') centro.valor_pago += linha.valor_original;
    else if (linha.status === 'inadimplente') centro.valor_vencido += linha.saldo_aberto;
    else centro.valor_a_vencer += linha.saldo_aberto;
  }

  return [...porCentro.values()]
    .map((centro) => {
      const clusters = { ...CLUSTERS_ZERADOS_SCORE };
      let totalClientes = 0;
      for (const cluster of CLUSTERS_SCORE) {
        clusters[cluster] = centro.clientesPorCluster[cluster].size;
        totalClientes += clusters[cluster];
      }
      return {
        cost_center_id: centro.cost_center_id,
        cost_center_name: centro.cost_center_name,
        clusters,
        total_clientes: totalClientes,
        valor_pago: centro.valor_pago,
        valor_vencido: centro.valor_vencido,
        valor_a_vencer: centro.valor_a_vencer,
      };
    })
    .filter((centro) => centro.total_clientes > 0)
    // Mais vencido primeiro (é o mais urgente pra cobrança); empatado no
    // vencido, o maior "a vencer" vem antes (mais volume batendo na porta);
    // nome só desempata o que sobrar (ex.: os dois zerados).
    .sort(
      (a, b) =>
        b.valor_vencido - a.valor_vencido ||
        b.valor_a_vencer - a.valor_a_vencer ||
        a.cost_center_name.localeCompare(b.cost_center_name, 'pt-BR')
    );
}

// Nível 2 (Cliente, versão nova): dentro de 1 centro de custo, 1 linha por
// combinação cliente+título (bill_id) — não por cliente puro, porque
// "Parcelas atual/total" (installment_number, formato "3/12" vindo direto do
// Sienge) só faz sentido dentro de 1 título por vez; um cliente com 2
// títulos no mesmo centro aparece em 2 linhas. "Parcela atual" é a parcela
// em aberto mais antiga (a próxima da fila de cobrança); sem nenhuma em
// aberto (título 100% quitado), cai na última (mais recente), pra
// representar "chegou ao fim".
async function listClientesPorCentroCusto(empresaId, costCenterId, filtros = {}) {
  const linhas = (await buscarParcelasComCluster(empresaId, { ...filtros, costCenterIds: [costCenterId] })).filter(
    (l) => String(l.cost_center_id) === String(costCenterId)
  );

  const porTitulo = new Map();
  for (const linha of linhas) {
    const chave = `${linha.client_id}|${linha.bill_id}`;
    if (!porTitulo.has(chave)) {
      porTitulo.set(chave, {
        client_id: linha.client_id,
        client_name: linha.client_name,
        bill_id: linha.bill_id,
        cluster: CLUSTERS_SCORE.includes(linha.cluster) ? linha.cluster : 'novo',
        valor_pago: 0,
        valor_vencido: 0,
        valor_a_vencer: 0,
        parcelas: [],
      });
    }
    const titulo = porTitulo.get(chave);
    if (linha.status === 'em_dia' || linha.status === 'atraso') titulo.valor_pago += linha.valor_original;
    else if (linha.status === 'inadimplente') titulo.valor_vencido += linha.saldo_aberto;
    else titulo.valor_a_vencer += linha.saldo_aberto;
    titulo.parcelas.push(linha);
  }

  return [...porTitulo.values()]
    .map((titulo) => {
      const abertas = titulo.parcelas.filter((p) => p.status !== 'em_dia' && p.status !== 'atraso');
      const candidatas = abertas.length > 0 ? abertas : titulo.parcelas;
      const ordenadas = [...candidatas].sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
      const parcelaAtual = abertas.length > 0 ? ordenadas[0] : ordenadas[ordenadas.length - 1];
      return {
        client_id: titulo.client_id,
        client_name: titulo.client_name,
        bill_id: titulo.bill_id,
        cluster: titulo.cluster,
        valor_pago: titulo.valor_pago,
        valor_vencido: titulo.valor_vencido,
        valor_a_vencer: titulo.valor_a_vencer,
        parcela_atual: parcelaAtual?.installment_number || null,
        parcela_atual_installment_id: parcelaAtual?.installment_id ?? null,
        // Etapa da "parcela atual" (a mais antiga em aberto) — título 100%
        // quitado cai na última parcela (paga), que nunca tem etapa (ver
        // buscarParcelasComCluster), então já sai null sozinho aqui.
        etapa_nome: parcelaAtual?.etapa_nome ?? null,
      };
    })
    // Mesmo critério do Nível 1 (Centro de Custo): mais vencido primeiro,
    // empate desempatado pelo maior "a vencer"; nome+título só entram se
    // sobrar empate nos dois valores (ex.: título 100% quitado, os dois
    // zerados).
    .sort(
      (a, b) =>
        b.valor_vencido - a.valor_vencido ||
        b.valor_a_vencer - a.valor_a_vencer ||
        (a.client_name || '').localeCompare(b.client_name || '', 'pt-BR') ||
        a.bill_id - b.bill_id
    );
}

// Nível 3 (Parcela, folha de verdade): as parcelas individuais de 1 título
// (bill_id) dentro do centro de custo aberto, ordenadas por installment_id.
// Status por parcela — quatro possíveis, nunca mais que isso (pedido do
// usuário):
//   - paga até a data de vencimento: 'em_dia'
//   - paga depois do vencimento (usa o último recebimento lançado, caso
//     tenha mais de uma baixa parcial): 'atraso'
//   - em aberto E já passou do mesmo limite de dias do Motor de Risco que
//     define Inadimplência na régua de cobrança (ver getLimiteVigente,
//     mesmo parâmetro de reguaCobranca.service.js/buscarLinhasClassificadas
//     acima): 'inadimplente'
//   - em aberto e ainda dentro do limite: 'a_vencer'
// `valor_pago`/`valor_vencido`/`valor_a_vencer`: mesmo trio de colunas dos
// Níveis 1/2 (buscarParcelasComCluster), só que aqui é o valor de 1 parcela
// só — sempre com só um dos três preenchido (os outros dois zerados),
// espelhando o status desta mesma linha. Pago usa `original_amount` (o
// valor cheio da parcela, já que o saldo em aberto dela é zero); vencido/a
// vencer usam `corrected_balance_amount` (o que ainda falta pagar).
async function listParcelasPorTitulo(empresaId, costCenterId, billId, filtros = {}) {
  const limite = await getLimiteVigente(empresaId);
  const etapasPorCluster = await carregarEtapasPorCluster(empresaId);

  const params = [empresaId, ORIGIN_ID_PADRAO, billId];
  let filtroCentro = '';
  if (costCenterId) {
    params.push(costCenterId);
    filtroCentro = ` AND cat.cost_center_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT si.bill_id, si.installment_id, si.due_date, si.corrected_balance_amount, si.original_amount,
            si.payment_term_description, si.installment_number,
            pg.ultimo_pagamento, COALESCE(ccc.cluster, 'novo') AS cluster
     FROM sie_income si
     JOIN sie_income_categorias cat
       ON cat.bill_id = si.bill_id AND cat.installment_id = si.installment_id AND cat.empresa_id = si.empresa_id
     LEFT JOIN cobranca_clientes_clusters ccc
       ON ccc.empresa_id = si.empresa_id AND ccc.client_id = si.client_id
     LEFT JOIN (
       SELECT bill_id, installment_id, MAX(payment_date) AS ultimo_pagamento
       FROM sie_income_recebimentos
       WHERE empresa_id = $1
       GROUP BY bill_id, installment_id
     ) pg ON pg.bill_id = si.bill_id AND pg.installment_id = si.installment_id
     WHERE si.empresa_id = $1 AND si.origin_id = $2 AND si.bill_id = $3${filtroCentro}
     ORDER BY si.installment_id ASC`,
    params
  );

  const hoje = hojeComoDataUTC();
  const filtroStatus =
    Array.isArray(filtros.statusParcela) && filtros.statusParcela.length > 0 ? new Set(filtros.statusParcela) : null;

  return rows
    .map((row) => {
      const paga = Number(row.corrected_balance_amount) === 0;
      const diasSigned = diasEntre(row.due_date, hoje);
      let status;
      if (paga) {
        status = row.ultimo_pagamento && new Date(row.ultimo_pagamento) > new Date(row.due_date) ? 'atraso' : 'em_dia';
      } else if (diasSigned > limite) {
        status = 'inadimplente';
      } else {
        status = 'a_vencer';
      }

      // Mesma regra de buscarParcelasComCluster: etapa só existe pra
      // parcela em aberto, na régua do cluster do cliente (ou 'inad' se já
      // for inadimplente), presa na última etapa até ser quitada.
      let etapaNome = null;
      if (!paga) {
        const clusterRegua = status === 'inadimplente' ? 'inad' : row.cluster;
        const etapa = acharEtapaAtiva(etapasPorCluster, clusterRegua, diasSigned);
        etapaNome = etapa?.nome ?? null;
      }

      const saldoAberto = Number(row.corrected_balance_amount) || 0;
      return {
        bill_id: row.bill_id,
        installment_id: row.installment_id,
        due_date: row.due_date,
        installment_number: row.installment_number,
        payment_term_description: row.payment_term_description,
        status,
        etapa_nome: etapaNome,
        valor_pago: paga ? Number(row.original_amount) || 0 : 0,
        valor_vencido: status === 'inadimplente' ? saldoAberto : 0,
        valor_a_vencer: status === 'a_vencer' ? saldoAberto : 0,
      };
    })
    .filter((p) => !filtroStatus || filtroStatus.has(p.status));
}

// Nível 2 do drilldown ANTIGO por régua (não usado pelo frontend hoje —
// ver comentário no topo do módulo): quantas parcelas deste cluster caem
// em cada etapa da régua. Uma parcela fora do range de todas as etapas
// configuradas já nem chega aqui
// (descartada em buscarLinhasClassificadas) — não existe mais bucket "Sem
// etapa": só o range coberto pela régua (da 1ª etapa em diante) conta como
// cobrança ativa. O scaffold de etapas vem sempre do cadastro (pra aparecer
// com 0 mesmo sem parcela nenhuma ainda).
async function getEtapasPorCluster(empresaId, cluster, filtros = {}) {
  if (!CLUSTERS_VALIDOS.includes(cluster)) throw badRequest('Cluster inválido.');

  // Traz canais + template já aqui (não em buscarLinhasClassificadas, que
  // só precisa de id/dias e é chamada 5x por requisição — ver
  // listEtapasComComunicacao) pra mostrar, ao lado do nome de cada etapa,
  // por qual canal ela dispara e permitir pré-visualizar a mensagem real.
  const etapasConfig = await listEtapasComComunicacao(empresaId, cluster);
  const linhas = (await buscarLinhasClassificadas(empresaId, filtros)).filter((l) => l.cluster === cluster);

  const contagemPorEtapa = new Map();
  for (const linha of linhas) {
    contagemPorEtapa.set(String(linha.etapa_id), (contagemPorEtapa.get(String(linha.etapa_id)) || 0) + 1);
  }

  const etapas = etapasConfig.map((e) => ({
    etapa_id: e.id,
    etapa_nome: e.nome,
    dias: e.dias,
    total_parcelas: contagemPorEtapa.get(String(e.id)) || 0,
    responsavel_nome: e.responsavel_nome,
    canal_whatsapp: e.canal_whatsapp,
    canal_email: e.canal_email,
    canal_ligacao: e.canal_ligacao,
    template: e.template_id
      ? {
          id: e.template_id,
          nome: e.template_nome,
          assunto: e.template_assunto,
          corpo: e.template_corpo,
          enviar_boleto: e.template_enviar_boleto,
        }
      : null,
  }));

  return {
    total_parcelas: linhas.length,
    etapas,
  };
}

// Nível 3: dentro de 1 cluster + 1 etapa específicos, 1 linha por cliente
// com a quantidade de parcelas dele ali — mesmo padrão dos níveis acima
// (nome + contagem, sem colunas extras). Um cliente com mais de uma parcela
// na mesma etapa (mesmo pedido de "repetir quando cai em etapas diferentes"
// — aqui é a mesma etapa, então soma em vez de repetir linha) aparece 1 vez
// só, com o total. Não é mais o nível folha: clicar aqui revela as parcelas
// individuais dele (ver listParcelasCliente) — 1 direto pro histórico se só
// tiver 1, uma lista se tiver mais de 1.
async function listParcelas(empresaId, cluster, etapaId, filtros = {}, { page = 1, limit = 50 } = {}) {
  if (!CLUSTERS_VALIDOS.includes(cluster)) throw badRequest('Cluster inválido.');

  // `search` (nome do cliente) já vem em `filtros` e é aplicado dentro de
  // buscarLinhasClassificadas — não filtra de novo aqui.
  const linhas = (await buscarLinhasClassificadas(empresaId, filtros)).filter(
    (l) => l.cluster === cluster && l.etapa_id === etapaId
  );

  const porCliente = new Map();
  for (const linha of linhas) {
    const chave = String(linha.client_id);
    if (!porCliente.has(chave)) {
      porCliente.set(chave, { client_id: linha.client_id, client_name: linha.client_name, total_parcelas: 0 });
    }
    porCliente.get(chave).total_parcelas += 1;
  }

  // Quem tem mais parcelas nesta etapa aparece primeiro — nome só desempata
  // entre clientes com a mesma quantidade.
  const clientes = [...porCliente.values()].sort(
    (a, b) => b.total_parcelas - a.total_parcelas || (a.client_name || '').localeCompare(b.client_name || '', 'pt-BR')
  );

  const total = clientes.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const inicio = (page - 1) * limit;
  const pagina = clientes.slice(inicio, inicio + limit);

  return {
    data: pagina,
    pagination: { page, limit, total, totalPages },
  };
}

// Nível 4 (folha de verdade): as parcelas individuais de 1 cliente dentro
// de 1 cluster + 1 etapa específicos — cada linha é 1 parcela de verdade
// (bill_id+installment_id), nunca agregada, com o número do documento (pra
// diferenciar quando o cliente tem mais de um tipo/contrato) e o
// vencimento. É o que abre o Histórico de Etapas (ver
// regua-cobranca-historico/historicoCliente.service.js) — histórico é
// sempre de 1 parcela só, nunca do cliente inteiro.
async function listParcelasCliente(empresaId, cluster, etapaId, clientId, filtros = {}) {
  if (!CLUSTERS_VALIDOS.includes(cluster)) throw badRequest('Cluster inválido.');

  const linhas = (await buscarLinhasClassificadas(empresaId, filtros)).filter(
    (l) => l.cluster === cluster && l.etapa_id === etapaId && String(l.client_id) === String(clientId)
  );

  return linhas
    .map((l) => ({
      bill_id: l.bill_id,
      installment_id: l.installment_id,
      due_date: l.due_date,
      document_identification_name: l.document_identification_name,
      document_number: l.document_number,
      installment_number: l.installment_number,
      corrected_balance_amount: l.corrected_balance_amount,
    }))
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
}

module.exports = {
  CLUSTERS_VALIDOS,
  CLUSTERS_SCORE,
  STATUS_PARCELA_VALIDOS,
  getResumoPorCentroCusto,
  listClientesPorCentroCusto,
  listParcelasPorTitulo,
  getEtapasPorCluster,
  listParcelas,
  listParcelasCliente,
};
