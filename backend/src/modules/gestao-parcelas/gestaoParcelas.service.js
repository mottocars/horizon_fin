const pool = require('../../config/db');
const {
  getLimiteVigente,
  listEtapasAtivasPorCluster,
  listEtapasComComunicacao,
} = require('../regua-cobranca/reguaCobranca.service');

const CLUSTERS_VALIDOS = ['novo', 'bom', 'duvidoso', 'mau', 'inad'];
const CLUSTERS_SCORE = ['novo', 'bom', 'duvidoso', 'mau'];

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

  const etapasPorCluster = {};
  await Promise.all(
    CLUSTERS_VALIDOS.map(async (cluster) => {
      etapasPorCluster[cluster] = await listEtapasAtivasPorCluster(empresaId, cluster);
    })
  );

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

      // Acha a etapa dona deste dia: a de maior `dias` ainda <= diasSigned
      // (etapas já vêm ordenadas ASC — para no primeiro `dias > diasSigned`).
      // Mesma semântica de faixa contígua do faixaAtiva do frontend, só que
      // "dado o dia, ache a etapa" em vez do inverso. A última etapa
      // configurada nunca tem teto (nada com `dias` maior fecha a faixa
      // dela) — pra cluster 'inad' isso é de propósito (parcela inadimplente
      // some só quando quitada, nunca por "passar" da última etapa
      // configurada); pra cluster de score, na prática nunca chega a
      // importar, porque `diasSigned > limite` já vira 'inad' antes disso.
      const etapas = etapasPorCluster[cluster] || [];
      let etapa = null;
      for (const e of etapas) {
        if (e.dias <= diasSigned) etapa = e;
        else break;
      }

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

// Nível 0+1 (Centro de Custo + Cluster, numa chamada só — ver
// gestaoParcelas.controller.js e a justificativa no plano: aqui os dois
// níveis são só contagem, sem saldo/score extra pra buscar de novo ao
// expandir). Centros sem parcela nenhuma ainda aparecem zerados (mesmo
// universo "Lançamento" de cobrancaClusters.service.js::getResumoPorCentroCusto).
async function getResumoPorCentroCusto(empresaId, filtros = {}) {
  const paramsCentros = [empresaId];
  let filtroSelecao = '';
  if (Array.isArray(filtros.costCenterIds) && filtros.costCenterIds.length > 0) {
    paramsCentros.push(filtros.costCenterIds);
    filtroSelecao = ` AND c.sienge_id = ANY($${paramsCentros.length}::bigint[])`;
  }
  const { rows: centros } = await pool.query(
    `SELECT DISTINCT c.sienge_id, c.name
     FROM centros_custo_sienge c
     JOIN centro_custo_etapas_historico h
       ON h.sienge_id = c.sienge_id AND h.empresa_id = c.empresa_id AND h.data_inicio IS NOT NULL
     JOIN mascara_itens m
       ON m.id = h.mascara_item_id AND m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.descricao = 'Lançamento'
     WHERE c.empresa_id = $1${filtroSelecao}
     ORDER BY c.name ASC`,
    paramsCentros
  );
  if (centros.length === 0) return [];

  const linhas = await buscarLinhasClassificadas(empresaId, filtros);

  const contagemPorCentro = new Map();
  for (const linha of linhas) {
    const chave = String(linha.cost_center_id);
    if (!contagemPorCentro.has(chave)) contagemPorCentro.set(chave, { ...CLUSTERS_ZERADOS });
    contagemPorCentro.get(chave)[linha.cluster] += 1;
  }

  return centros.map((c) => {
    const clusters = contagemPorCentro.get(String(c.sienge_id)) || { ...CLUSTERS_ZERADOS };
    return {
      cost_center_id: c.sienge_id,
      cost_center_name: c.name,
      total_parcelas: Object.values(clusters).reduce((soma, n) => soma + n, 0),
      clusters,
    };
  });
}

// Nível 2: quantas parcelas deste cluster caem em cada etapa da régua. Uma
// parcela fora do range de todas as etapas configuradas já nem chega aqui
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
  getResumoPorCentroCusto,
  getEtapasPorCluster,
  listParcelas,
  listParcelasCliente,
};
