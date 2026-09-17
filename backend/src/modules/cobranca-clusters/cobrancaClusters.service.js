const pool = require('../../config/db');
const { calcularNotas, calcularScore, classificarCluster } = require('../motor-risco/scoreCalculo');

const UM_DIA_MS = 24 * 60 * 60 * 1000;

// Só parcelas com origin_id = 'CO' entram na conta em qualquer leitura de
// sie_income deste módulo (cálculo do score, saldo, filtros, lista de
// parcelas) — os demais origin_id não são contas a receber de verdade pra
// fins de cobrança/clusterização.
const ORIGIN_ID_PADRAO = 'CO';

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// Colunas DATE do Postgres voltam do driver `pg` como Date em meia-noite
// LOCAL do processo Node (ex.: 2026-08-15 vira 2026-08-15T00:00:00-03:00 em
// America/Sao_Paulo, ou seja 2026-08-15T03:00:00Z). Ancorar tudo numa
// meia-noite UTC (em vez de comparar os Date crus) garante que due_date,
// payment_date e "hoje" fiquem numa base só, imune a mudança de fuso do
// servidor e a horário de verão — bug sutil, mas fatal num cálculo de dias
// de atraso.
function inicioDoDiaUTC(data) {
  const d = new Date(data);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// "Hoje" não vem do banco — é o instante atual do processo, em hora local
// (o dia calendário que importa pro negócio). Ancora esse dia calendário
// local numa meia-noite UTC, pra poder comparar em pé de igualdade com as
// datas vindas do Postgres.
function hojeComoDataUTC() {
  const agora = new Date();
  return new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()));
}

function subtrairMeses(dataUTC, meses) {
  return new Date(Date.UTC(dataUTC.getUTCFullYear(), dataUTC.getUTCMonth() - meses, dataUTC.getUTCDate()));
}

function diasEntre(dataMenor, dataMaior) {
  return Math.round((inicioDoDiaUTC(dataMaior).getTime() - inicioDoDiaUTC(dataMenor).getTime()) / UM_DIA_MS);
}

function mesesEntre(dataMenor, dataMaior) {
  const a = inicioDoDiaUTC(dataMenor);
  const b = inicioDoDiaUTC(dataMaior);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

// Competência do recálculo: se hoje já passou do dia configurado, a
// competência é o mês atual; senão, ainda é a do mês anterior — é isso que
// deixa o cluster estável durante o mês (dia_recalculo). `hoje` já é uma
// meia-noite UTC (ver hojeComoDataUTC), por isso usa os getters UTC.
function calcularMesReferencia(hoje, diaRecalculo) {
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();
  if (hoje.getUTCDate() >= diaRecalculo) return new Date(Date.UTC(ano, mes, 1));
  return new Date(Date.UTC(ano, mes - 1, 1));
}

// Busca a versão vigente (maior número) do Motor de Risco da empresa, já
// com os 5 indicadores — mesmo formato usado por motorRisco.service.js.
async function getVersaoVigente(empresaId) {
  const { rows } = await pool.query(
    `SELECT id, versao, tolerancia_dias, janela_observacao_meses, gatilho_reincidencia_dias,
            minimo_parcelas, dia_recalculo, trava_subida_parcelas, dias_vencidos_regua_cobranca,
            corte_bom_pagador, corte_pagador_duvidoso
     FROM motor_risco_versoes
     WHERE empresa_id = $1
     ORDER BY versao DESC
     LIMIT 1`,
    [empresaId]
  );
  const versao = rows[0];
  if (!versao) return null;

  const { rows: indicadores } = await pool.query(
    `SELECT indicador, nota_0, nota_100, peso FROM motor_risco_indicadores WHERE versao_id = $1 ORDER BY id`,
    [versao.id]
  );
  return { ...versao, indicadores };
}

// Uma linha por parcela vencida/paga da empresa inteira, já com a data do
// último recebimento daquele bill_id+installment_id (só é relevante quando
// o saldo em aberto é zero — parcela paga). Uma chamada só pro banco inteiro
// em vez de N chamadas por cliente.
async function buscarParcelasEmpresa(empresaId) {
  const { rows } = await pool.query(
    `SELECT si.client_id, si.client_name, si.bill_id, si.installment_id, si.due_date,
            si.corrected_balance_amount, rec.data_pagamento
     FROM sie_income si
     LEFT JOIN LATERAL (
       SELECT MAX(sr.payment_date) AS data_pagamento
       FROM sie_income_recebimentos sr
       WHERE sr.bill_id = si.bill_id AND sr.installment_id = si.installment_id AND sr.empresa_id = si.empresa_id
     ) rec ON TRUE
     WHERE si.empresa_id = $1 AND si.client_id IS NOT NULL AND si.origin_id = $2
     ORDER BY si.client_id, si.due_date`,
    [empresaId, ORIGIN_ID_PADRAO]
  );
  return rows;
}

function agruparPorCliente(parcelas) {
  const porCliente = new Map();
  for (const p of parcelas) {
    if (!porCliente.has(p.client_id)) porCliente.set(p.client_id, { clientName: p.client_name, parcelas: [] });
    porCliente.get(p.client_id).parcelas.push(p);
  }
  return porCliente;
}

// Aplica o mapeamento de negócio (ver plano) sobre as parcelas de 1 cliente:
// status de cada parcela, os 5 indicadores brutos, a regra dura de dias
// vencidos e a sequência atual de parcelas consecutivas em dia.
function agregarCliente(parcelas, versao, hoje) {
  const inicioJanela = subtrairMeses(hoje, versao.janela_observacao_meses);

  const processadas = parcelas.map((p) => {
    const saldo = Number(p.corrected_balance_amount ?? 0);
    const paga = saldo === 0;
    const vencida = inicioDoDiaUTC(p.due_date) <= hoje;
    let diasAtraso = 0;
    if (paga) {
      const dataRef = p.data_pagamento ? new Date(p.data_pagamento) : new Date(p.due_date);
      diasAtraso = Math.max(0, diasEntre(p.due_date, dataRef));
    } else if (vencida) {
      // Regra fixa: parcela vencida e ainda em aberto sempre entra na conta,
      // com o atraso crescendo até hoje.
      diasAtraso = diasEntre(p.due_date, hoje);
    }
    return { ...p, paga, vencida, diasAtraso };
  });

  // Regra dura da régua de cobrança: qualquer parcela em aberto vencida há
  // mais dias que o limite configurado — não se limita à janela de
  // observação, uma dívida antiga em aberto continua sendo dívida.
  const parcelasRegraDura = processadas
    .filter((p) => !p.paga && p.vencida && p.diasAtraso > versao.dias_vencidos_regua_cobranca)
    .sort((a, b) => b.diasAtraso - a.diasAtraso);
  const regraDuraAtiva = parcelasRegraDura.length > 0;

  const vencidasJanela = processadas.filter((p) => p.vencida && inicioDoDiaUTC(p.due_date) >= inicioJanela);
  const qtdParcelas = vencidasJanela.length;

  const emDia = vencidasJanela.filter((p) => p.diasAtraso <= versao.tolerancia_dias).length;
  const pctEmDia = qtdParcelas > 0 ? Math.max(0, Math.min(100, (emDia / qtdParcelas) * 100)) : 0;
  const atrasoMedio = qtdParcelas > 0 ? vencidasJanela.reduce((s, p) => s + p.diasAtraso, 0) / qtdParcelas : 0;
  const maiorAtraso = qtdParcelas > 0 ? Math.max(...vencidasJanela.map((p) => p.diasAtraso)) : 0;
  const reincidencia = vencidasJanela.filter((p) => p.diasAtraso > versao.gatilho_reincidencia_dias).length;

  // Relacionamento conta a partir da primeira parcela do cliente, vencida ou
  // não — é sobre há quanto tempo ele é cliente, não sobre pontualidade.
  const primeiraData = processadas.reduce(
    (min, p) => (!min || new Date(p.due_date) < min ? new Date(p.due_date) : min),
    null
  );
  const relacionamento = primeiraData ? Math.max(0, mesesEntre(primeiraData, hoje)) : 0;

  // Sequência de parcelas consecutivas em dia, contada da vencida mais
  // recente pra trás — reseta na primeira que estiver atrasada. É
  // recalculada sempre a partir dos dados atuais (não precisa de memória
  // entre execuções): "se atrasar a 4ª, a contagem recomeça" é uma
  // propriedade do próprio histórico.
  const vencidasOrdenadas = [...vencidasJanela].sort((a, b) => new Date(b.due_date) - new Date(a.due_date));
  let streak = 0;
  for (const p of vencidasOrdenadas) {
    if (p.diasAtraso <= versao.tolerancia_dias) streak += 1;
    else break;
  }

  const brutos = {
    pct_em_dia: pctEmDia,
    atraso_medio: atrasoMedio,
    maior_atraso: maiorAtraso,
    reincidencia,
    relacionamento,
  };

  return { brutos, qtdParcelas, emDia, regraDuraAtiva, parcelasRegraDura, streak, parcelas: processadas };
}

const ORDEM_CLUSTER = { mau: 0, duvidoso: 1, bom: 2 };

// Piorar é sempre imediato. Melhorar só é aplicado se a sequência atual de
// parcelas em dia já atingiu a trava configurada — senão o cliente
// permanece no cluster oficial anterior, e fica marcado como bloqueado (pra
// auditoria). A transição pra/da "Novo cliente" nunca é travada: não há um
// cluster "melhor/pior" nesse caso, é uma mudança de elegibilidade, não uma
// melhora de comportamento.
function aplicarTravaSubida(clusterAtual, bruto, streak, travaSubidaParcelas) {
  if (!clusterAtual || clusterAtual.cluster === 'novo' || bruto.cluster === 'novo') {
    return { clusterFinal: bruto.cluster, bloqueadoPorTrava: false };
  }
  const ordemAtual = ORDEM_CLUSTER[clusterAtual.cluster];
  const ordemBruto = ORDEM_CLUSTER[bruto.cluster];
  if (ordemBruto <= ordemAtual) return { clusterFinal: bruto.cluster, bloqueadoPorTrava: false };
  if (streak >= travaSubidaParcelas) return { clusterFinal: bruto.cluster, bloqueadoPorTrava: false };
  return { clusterFinal: clusterAtual.cluster, bloqueadoPorTrava: true };
}

// Roda o pipeline inteiro pra todos os clientes da empresa: agrega os
// indicadores de cada um a partir da base real do Sienge, aplica a versão
// vigente do Motor de Risco, a regra dura e a trava de subida, e grava o
// resultado (estado atual + log auditável).
async function recalcularClusters(empresaId, usuarioId) {
  const versao = await getVersaoVigente(empresaId);
  if (!versao) {
    throw badRequest('Configure e publique uma versão do Motor de Risco desta empresa antes de recalcular os clusters.');
  }

  const hoje = hojeComoDataUTC();
  const mesReferencia = calcularMesReferencia(hoje, versao.dia_recalculo);
  const parcelas = await buscarParcelasEmpresa(empresaId);
  const porCliente = agruparPorCliente(parcelas);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Serializa recálculos concorrentes da mesma empresa (mesmo espírito do
    // motor-risco.service.js ao criar versão).
    await client.query('SELECT id FROM empresas WHERE id = $1 FOR UPDATE', [empresaId]);

    const { rows: atuais } = await client.query(
      'SELECT client_id, cluster, motivo_tipo FROM cobranca_clientes_clusters WHERE empresa_id = $1',
      [empresaId]
    );
    const atuaisPorCliente = new Map(atuais.map((row) => [String(row.client_id), row]));

    let processados = 0;
    for (const [clientId, info] of porCliente) {
      const agregado = agregarCliente(info.parcelas, versao, hoje);
      const notas = calcularNotas(versao.indicadores, agregado.brutos);
      const score = calcularScore(versao.indicadores, notas);
      const bruto = classificarCluster(
        score,
        agregado.qtdParcelas,
        versao.minimo_parcelas,
        versao.corte_bom_pagador,
        versao.corte_pagador_duvidoso,
        agregado.regraDuraAtiva
      );

      const clusterAtual = atuaisPorCliente.get(String(clientId)) || null;
      const { clusterFinal, bloqueadoPorTrava } = aplicarTravaSubida(
        clusterAtual,
        bruto,
        agregado.streak,
        versao.trava_subida_parcelas
      );

      // Bloqueado pela trava: o cliente permanece oficialmente no motivo que
      // já tinha (na prática, sempre 'score' — regra dura e novo_cliente
      // nunca ficam represados, ver aplicarTravaSubida). O score gravado é
      // sempre o score real recém-calculado, só fica nulo quando o motivo
      // não é score-driven (novo cliente ou regra dura).
      const motivoFinal = bloqueadoPorTrava ? clusterAtual.motivo_tipo || 'score' : bruto.motivo;
      const scoreGravado = motivoFinal === 'score' ? Number(score.toFixed(2)) : null;

      // Registro completo da simulação deste cliente — o mesmo raciocínio do
      // simulador "Testar com um cliente" (nota_0/nota_100 de cada
      // indicador, os cortes, o mínimo de parcelas, a trava de subida),
      // congelado nesta competência pra sempre dar pra rastrear exatamente
      // por que ele caiu neste cluster (ver ClienteClusterDetalhe.jsx).
      const indicadoresDetalhe = {
        indicadores: versao.indicadores.map((ind, i) => ({
          indicador: ind.indicador,
          valor_bruto: agregado.brutos[ind.indicador],
          nota_0: Number(ind.nota_0),
          nota_100: Number(ind.nota_100),
          nota: notas[i],
          peso: Number(ind.peso),
          pontos: (notas[i] * Number(ind.peso)) / 100,
        })),
        contexto: {
          score,
          cluster_bruto: bruto.cluster,
          motivo_bruto: bruto.motivo,
          qtd_parcelas_vencidas: agregado.qtdParcelas,
          parcelas_pagas_em_dia: agregado.emDia,
          minimo_parcelas: versao.minimo_parcelas,
          corte_bom_pagador: versao.corte_bom_pagador,
          corte_pagador_duvidoso: versao.corte_pagador_duvidoso,
          tolerancia_dias: versao.tolerancia_dias,
          janela_observacao_meses: versao.janela_observacao_meses,
          gatilho_reincidencia_dias: versao.gatilho_reincidencia_dias,
          dias_vencidos_regua_cobranca: versao.dias_vencidos_regua_cobranca,
          streak_parcelas_em_dia: agregado.streak,
          trava_subida_parcelas: versao.trava_subida_parcelas,
        },
      };

      const regraDuraDetalhe = agregado.regraDuraAtiva
        ? agregado.parcelasRegraDura.map((p) => ({
            bill_id: p.bill_id,
            installment_id: p.installment_id,
            due_date: p.due_date,
            dias_atraso: p.diasAtraso,
            limite_configurado: versao.dias_vencidos_regua_cobranca,
          }))
        : null;

      await client.query(
        `INSERT INTO cobranca_clientes_clusters (
           empresa_id, client_id, client_name, cluster, score, motivo_tipo, regra_dura_ativa,
           parcelas_em_dia_seguidas, versao_motor_risco_id, indicadores_detalhe, mes_referencia, calculado_em
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
         ON CONFLICT (empresa_id, client_id) DO UPDATE SET
           client_name = EXCLUDED.client_name,
           cluster = EXCLUDED.cluster,
           score = EXCLUDED.score,
           motivo_tipo = EXCLUDED.motivo_tipo,
           regra_dura_ativa = EXCLUDED.regra_dura_ativa,
           parcelas_em_dia_seguidas = EXCLUDED.parcelas_em_dia_seguidas,
           versao_motor_risco_id = EXCLUDED.versao_motor_risco_id,
           indicadores_detalhe = EXCLUDED.indicadores_detalhe,
           mes_referencia = EXCLUDED.mes_referencia,
           calculado_em = NOW()`,
        [
          empresaId,
          clientId,
          info.clientName,
          clusterFinal,
          scoreGravado,
          motivoFinal,
          agregado.regraDuraAtiva,
          agregado.streak,
          versao.id,
          JSON.stringify(indicadoresDetalhe),
          mesReferencia,
        ]
      );

      await client.query(
        `INSERT INTO cobranca_clientes_clusters_historico (
           empresa_id, client_id, client_name, mes_referencia, cluster_anterior, cluster_novo, score,
           indicadores_detalhe, regra_dura_disparada, regra_dura_detalhe, subiu_bloqueado_por_trava,
           parcelas_em_dia_seguidas, versao_motor_risco_id, criado_por_usuario_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (empresa_id, client_id, mes_referencia) DO UPDATE SET
           client_name = EXCLUDED.client_name,
           cluster_novo = EXCLUDED.cluster_novo,
           score = EXCLUDED.score,
           indicadores_detalhe = EXCLUDED.indicadores_detalhe,
           regra_dura_disparada = EXCLUDED.regra_dura_disparada,
           regra_dura_detalhe = EXCLUDED.regra_dura_detalhe,
           subiu_bloqueado_por_trava = EXCLUDED.subiu_bloqueado_por_trava,
           parcelas_em_dia_seguidas = EXCLUDED.parcelas_em_dia_seguidas,
           versao_motor_risco_id = EXCLUDED.versao_motor_risco_id,
           criado_por_usuario_id = EXCLUDED.criado_por_usuario_id,
           criado_em = NOW()`,
        [
          empresaId,
          clientId,
          info.clientName,
          mesReferencia,
          clusterAtual?.cluster ?? null,
          clusterFinal,
          scoreGravado,
          JSON.stringify(indicadoresDetalhe),
          agregado.regraDuraAtiva,
          regraDuraDetalhe ? JSON.stringify(regraDuraDetalhe) : null,
          bloqueadoPorTrava,
          agregado.streak,
          versao.id,
          usuarioId,
        ]
      );

      processados += 1;
    }

    await client.query('COMMIT');
    return { total_clientes: processados, mes_referencia: mesReferencia, versao_utilizada: versao.versao };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Saldo em aberto por cliente (soma das parcelas com saldo <> 0), já
// quebrado em 3 baldes por vencimento — usado só pra exibição (nível 1 e
// nível 2), não entra em nenhum indicador do score:
// - vencido: due_date já passou (está em atraso agora);
// - no_mes: vence entre hoje e o fim do mês corrente (ainda não venceu);
// - a_vencer: vence depois do fim do mês corrente.
// CURRENT_DATE é seguro aqui (sem o cuidado de fuso que devido a due_date
// virar Date no Node — ver inicioDoDiaUTC acima): due_date e CURRENT_DATE
// são comparados inteiramente dentro do Postgres, ambos tipo DATE puro, sem
// componente de hora/fuso envolvido.
const SUBQUERY_SALDO_ABERTO = `(
  SELECT client_id,
    SUM(corrected_balance_amount) AS saldo_aberto,
    COALESCE(SUM(corrected_balance_amount) FILTER (WHERE due_date < CURRENT_DATE), 0) AS saldo_vencido,
    COALESCE(SUM(corrected_balance_amount) FILTER (
      WHERE due_date >= CURRENT_DATE AND due_date <= (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')
    ), 0) AS saldo_no_mes,
    COALESCE(SUM(corrected_balance_amount) FILTER (
      WHERE due_date > (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')
    ), 0) AS saldo_a_vencer
  FROM sie_income
  WHERE empresa_id = $1 AND corrected_balance_amount <> 0 AND origin_id = '${ORIGIN_ID_PADRAO}'
  GROUP BY client_id
)`;

// Filtro de Centro de Custo: SEMPRE restringe ao universo dos centros de
// custo com a etapa "Lançamento" já registrada (Histórico de Etapas) —
// mesmo critério e mesmas tabelas do filtro de Centro de Custo dos Repasses
// CEF (ver repassesCef.service.js::listCentrosComLancamento). Isso vale com
// ou sem seleção explícita do usuário no combobox: sem seleção, é "todos os
// centros com Lançamento" (não "todos os centros de custo do sistema,
// lançados ou não"); com seleção, estreita mais ainda, só aos ids
// escolhidos (que já são um subconjunto do mesmo universo, oferecidos pelo
// próprio combobox).
// `params` é mutado (bind params da query que está sendo montada); devolve o
// trecho SQL (com AND) pra colar no WHERE.
function condicaoCentroCusto(params, costCenterIds) {
  const temSelecao = Array.isArray(costCenterIds) && costCenterIds.length > 0;
  if (temSelecao) params.push(costCenterIds);
  return `EXISTS (
    SELECT 1 FROM sie_income si_cc
    JOIN sie_income_categorias cat_cc
      ON cat_cc.bill_id = si_cc.bill_id AND cat_cc.installment_id = si_cc.installment_id AND cat_cc.empresa_id = si_cc.empresa_id
    JOIN centro_custo_etapas_historico h_cc
      ON h_cc.sienge_id = cat_cc.cost_center_id AND h_cc.empresa_id = cat_cc.empresa_id AND h_cc.data_inicio IS NOT NULL
    JOIN mascara_itens m_cc
      ON m_cc.id = h_cc.mascara_item_id AND m_cc.tipo = 'ETAPAS_CENTRO_CUSTO' AND m_cc.descricao = 'Lançamento'
    WHERE si_cc.empresa_id = cc.empresa_id AND si_cc.client_id = cc.client_id AND si_cc.origin_id = '${ORIGIN_ID_PADRAO}'
    ${temSelecao ? `AND cat_cc.cost_center_id = ANY($${params.length}::bigint[])` : ''}
  )`;
}

// Filtro adicional (por enquanto só Centro de Custo, sempre restritivo por
// padrão — ver condicaoCentroCusto acima).
function condicoesFiltroAdicional(params, { costCenterIds } = {}) {
  const condicoes = [condicaoCentroCusto(params, costCenterIds)];
  return ` AND ${condicoes.join(' AND ')}`;
}

async function getResumo(empresaId, filtros = {}) {
  const params = [empresaId];
  const filtroSql = condicoesFiltroAdicional(params, filtros);
  const { rows } = await pool.query(
    `SELECT cc.cluster, COUNT(*)::int AS total_clientes,
            COALESCE(SUM(sa.saldo_aberto), 0) AS saldo_aberto,
            COALESCE(SUM(sa.saldo_vencido), 0) AS saldo_vencido,
            COALESCE(SUM(sa.saldo_no_mes), 0) AS saldo_no_mes,
            COALESCE(SUM(sa.saldo_a_vencer), 0) AS saldo_a_vencer
     FROM cobranca_clientes_clusters cc
     LEFT JOIN ${SUBQUERY_SALDO_ABERTO} sa ON sa.client_id = cc.client_id
     WHERE cc.empresa_id = $1${filtroSql}
     GROUP BY cc.cluster`,
    params
  );

  const paramsMeta = [empresaId];
  const filtroSqlMeta = condicoesFiltroAdicional(paramsMeta, filtros);
  const { rows: metaRows } = await pool.query(
    `SELECT MAX(calculado_em) AS ultimo_calculo, COUNT(*)::int AS total_clientes
     FROM cobranca_clientes_clusters cc
     WHERE cc.empresa_id = $1${filtroSqlMeta}`,
    paramsMeta
  );

  const porCluster = { novo: null, bom: null, duvidoso: null, mau: null };
  for (const row of rows) {
    porCluster[row.cluster] = {
      total_clientes: row.total_clientes,
      saldo_aberto: Number(row.saldo_aberto),
      saldo_vencido: Number(row.saldo_vencido),
      saldo_no_mes: Number(row.saldo_no_mes),
      saldo_a_vencer: Number(row.saldo_a_vencer),
    };
  }
  return {
    clusters: porCluster,
    total_clientes: metaRows[0]?.total_clientes ?? 0,
    ultimo_calculo: metaRows[0]?.ultimo_calculo ?? null,
  };
}

const CLUSTERS_ZERADOS = { novo: 0, bom: 0, duvidoso: 0, mau: 0 };

// Nível 0 da clusterização (drilldown por Centro de Custo, ver
// ClustersCobranca/CentrosCustoResumo.jsx): 1 linha por centro de custo com
// a etapa "Lançamento" (mesmo universo do filtro de Centro de Custo — ver
// condicaoCentroCusto acima), com total de clientes, saldo vencido e saldo
// no mês (mesmos 2 baldes que sobraram no nível 1, ver ClustersResumo.jsx),
// mais a quantidade de clientes por cluster (só essa parte, no canto
// direito da linha).
async function getResumoPorCentroCusto(empresaId, { costCenterIds } = {}) {
  const paramsCentros = [empresaId];
  let filtroSelecao = '';
  if (Array.isArray(costCenterIds) && costCenterIds.length > 0) {
    paramsCentros.push(costCenterIds);
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

  const idsPermitidos = centros.map((c) => c.sienge_id);
  const { rows: contagens } = await pool.query(
    `SELECT cat.cost_center_id, ccc.cluster, COUNT(DISTINCT ccc.client_id)::int AS total
     FROM sie_income_categorias cat
     JOIN sie_income si
       ON si.bill_id = cat.bill_id AND si.installment_id = cat.installment_id AND si.empresa_id = cat.empresa_id
     JOIN cobranca_clientes_clusters ccc
       ON ccc.client_id = si.client_id AND ccc.empresa_id = si.empresa_id
     WHERE cat.empresa_id = $1 AND si.origin_id = $2 AND cat.cost_center_id = ANY($3::bigint[])
     GROUP BY cat.cost_center_id, ccc.cluster`,
    [empresaId, ORIGIN_ID_PADRAO, idsPermitidos]
  );

  // Saldo vencido/no mês por centro de custo — mesma filosofia "inclusão
  // por cliente" do resto do módulo (ver condicaoCentroCusto acima): um
  // cliente entra no centro de custo se tocar nele com QUALQUER parcela, e
  // aí conta o saldo DELE INTEIRO (todas as parcelas, de todos os centros),
  // não só a fatia daquele centro — é o mesmo cálculo de SUBQUERY_SALDO_ABERTO
  // já usado no nível 1 (getResumo), só que somado por centro de custo em
  // vez de por cliente sozinho. Garante que, ao expandir a linha, a soma dos
  // 4 clusters do nível 1 bate com o que aparece aqui recolhido.
  const { rows: saldos } = await pool.query(
    `WITH centro_cliente AS (
       SELECT DISTINCT cat.cost_center_id, si.client_id
       FROM sie_income_categorias cat
       JOIN sie_income si
         ON si.bill_id = cat.bill_id AND si.installment_id = cat.installment_id AND si.empresa_id = cat.empresa_id
       WHERE cat.empresa_id = $1 AND si.origin_id = $2 AND cat.cost_center_id = ANY($3::bigint[])
     )
     SELECT cc.cost_center_id,
       COALESCE(SUM(sa.saldo_vencido), 0) AS saldo_vencido,
       COALESCE(SUM(sa.saldo_no_mes), 0) AS saldo_no_mes
     FROM centro_cliente cc
     JOIN ${SUBQUERY_SALDO_ABERTO} sa ON sa.client_id = cc.client_id
     GROUP BY cc.cost_center_id`,
    [empresaId, ORIGIN_ID_PADRAO, idsPermitidos]
  );

  // `cost_center_id` volta do driver `pg` como string (coluna bigint) —
  // normaliza pra String() dos dois lados antes de usar como chave do Map,
  // senão o lookup abaixo nunca bate (string !== number) e tudo cai no
  // fallback zerado.
  const contagemPorCentro = new Map();
  for (const row of contagens) {
    const chave = String(row.cost_center_id);
    if (!contagemPorCentro.has(chave)) {
      contagemPorCentro.set(chave, { ...CLUSTERS_ZERADOS });
    }
    contagemPorCentro.get(chave)[row.cluster] = row.total;
  }

  const saldoPorCentro = new Map();
  for (const row of saldos) {
    saldoPorCentro.set(String(row.cost_center_id), {
      saldo_vencido: Number(row.saldo_vencido),
      saldo_no_mes: Number(row.saldo_no_mes),
    });
  }

  // Só entra na lista o centro de custo que já tem cliente clusterizado —
  // um centro com a etapa Lançamento mas 0 clientes (ainda não recalculado,
  // ou sem movimento) só polui a listagem de Clusters de Clientes com uma
  // linha que não leva a lugar nenhum (o drilldown dela viria vazio).
  return centros
    .map((c) => {
      const clusters = contagemPorCentro.get(String(c.sienge_id)) || { ...CLUSTERS_ZERADOS };
      const saldo = saldoPorCentro.get(String(c.sienge_id)) || { saldo_vencido: 0, saldo_no_mes: 0 };
      return {
        cost_center_id: c.sienge_id,
        cost_center_name: c.name,
        total_clientes: Object.values(clusters).reduce((soma, n) => soma + n, 0),
        saldo_vencido: saldo.saldo_vencido,
        saldo_no_mes: saldo.saldo_no_mes,
        clusters,
      };
    })
    .filter((centro) => centro.total_clientes > 0);
}

const CLUSTERS_VALIDOS = ['novo', 'bom', 'duvidoso', 'mau'];

async function listClientesPorCluster(
  empresaId,
  cluster,
  { search = '', page = 1, limit = 20, costCenterIds } = {}
) {
  if (!CLUSTERS_VALIDOS.includes(cluster)) throw badRequest('Cluster inválido.');
  const offset = (page - 1) * limit;
  const termo = search ? `%${search}%` : null;

  const params = [empresaId, cluster, termo];
  const filtroSql = condicoesFiltroAdicional(params, { costCenterIds });
  const { rows } = await pool.query(
    `SELECT cc.client_id, cc.client_name, cc.score, cc.motivo_tipo, cc.regra_dura_ativa, cc.calculado_em,
            cc.indicadores_detalhe, COALESCE(sa.saldo_vencido, 0) AS saldo_vencido
     FROM cobranca_clientes_clusters cc
     LEFT JOIN ${SUBQUERY_SALDO_ABERTO} sa ON sa.client_id = cc.client_id
     WHERE cc.empresa_id = $1 AND cc.cluster = $2 AND ($3::text IS NULL OR cc.client_name ILIKE $3)${filtroSql}
     ORDER BY cc.client_name
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const countParams = [empresaId, cluster, termo];
  const filtroSqlCount = condicoesFiltroAdicional(countParams, { costCenterIds });
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM cobranca_clientes_clusters cc
     WHERE cc.empresa_id = $1 AND cc.cluster = $2 AND ($3::text IS NULL OR cc.client_name ILIKE $3)${filtroSqlCount}`,
    countParams
  );

  return {
    data: rows.map(({ indicadores_detalhe, ...row }) => ({
      ...row,
      saldo_vencido: Number(row.saldo_vencido),
      // Rastreio do score igual ao simulador "Testar com um cliente" — cada
      // indicador com valor bruto/nota/peso/pontos, pra mostrar em colunas
      // nesta lista sem precisar abrir o detalhe de cada cliente.
      indicadores: indicadores_detalhe?.indicadores || null,
    })),
    pagination: { page, limit, total: countRows[0].total, totalPages: Math.max(1, Math.ceil(countRows[0].total / limit)) },
  };
}

// Detalhe auditável de 1 cliente: estado oficial atual + o breakdown salvo
// na última competência calculada (mesma fonte que gerou o cluster
// mostrado, pra nunca divergir do que o nível 1/2 exibem) + a lista de
// parcelas e o rateio por centro de custo (dados atuais, só exibição) + o
// histórico de reclassificações.
async function getClienteDetalhe(empresaId, clientId) {
  const { rows: atualRows } = await pool.query(
    `SELECT client_id, client_name, cluster, score, motivo_tipo, regra_dura_ativa,
            parcelas_em_dia_seguidas, versao_motor_risco_id, mes_referencia, calculado_em
     FROM cobranca_clientes_clusters WHERE empresa_id = $1 AND client_id = $2`,
    [empresaId, clientId]
  );
  const atual = atualRows[0];
  if (!atual) {
    const e = new Error('Este cliente ainda não tem cluster calculado. Rode "Recalcular clusters" primeiro.');
    e.status = 404;
    e.expose = true;
    throw e;
  }

  const { rows: historico } = await pool.query(
    `SELECT mes_referencia, cluster_anterior, cluster_novo, score, indicadores_detalhe, regra_dura_disparada,
            regra_dura_detalhe, subiu_bloqueado_por_trava, parcelas_em_dia_seguidas, criado_em
     FROM cobranca_clientes_clusters_historico
     WHERE empresa_id = $1 AND client_id = $2
     ORDER BY mes_referencia DESC`,
    [empresaId, clientId]
  );

  // A lista de parcelas só mostra até 2 meses à frente de hoje — pra não
  // poluir a auditoria com dezenas/centenas de parcelas futuras de um
  // financiamento longo. Isso não afeta o score: nenhum indicador usa
  // parcela com due_date no futuro, só as vencidas entram na conta (ver
  // agregarCliente acima) — o corte aqui é só de exibição.
  const { rows: parcelas } = await pool.query(
    `SELECT si.bill_id, si.installment_id, si.due_date, si.corrected_balance_amount,
            si.document_identification_name, si.document_number, si.payment_term_description,
            rec.data_pagamento
     FROM sie_income si
     LEFT JOIN LATERAL (
       SELECT MAX(sr.payment_date) AS data_pagamento
       FROM sie_income_recebimentos sr
       WHERE sr.bill_id = si.bill_id AND sr.installment_id = si.installment_id AND sr.empresa_id = si.empresa_id
     ) rec ON TRUE
     WHERE si.empresa_id = $1 AND si.client_id = $2 AND si.origin_id = $3
       AND si.due_date <= CURRENT_DATE + INTERVAL '2 months'
     ORDER BY si.due_date DESC`,
    [empresaId, clientId, ORIGIN_ID_PADRAO]
  );

  // Dias entre vencimento e pagamento (ou até hoje, se ainda em aberto) —
  // mesma conta e mesmas funções que alimentam o score (ver agregarCliente
  // acima), só que aqui por parcela, pra auditoria visual. `em_alerta`
  // marca quem pagou atrasado ou ainda está em aberto vencido; parcela
  // futura (ainda não vencida) não entra nessa conta.
  const hoje = hojeComoDataUTC();
  const parcelasComAtraso = parcelas.map((p) => {
    const paga = Number(p.corrected_balance_amount ?? 0) === 0;
    const vencida = inicioDoDiaUTC(p.due_date) <= hoje;
    let diasAtraso = null;
    if (paga) {
      diasAtraso = Math.max(0, diasEntre(p.due_date, p.data_pagamento || p.due_date));
    } else if (vencida) {
      diasAtraso = diasEntre(p.due_date, hoje);
    }
    const emAlerta = (paga && diasAtraso > 0) || (!paga && vencida);
    return { ...p, paga, vencida, dias_atraso: diasAtraso, em_alerta: emAlerta };
  });

  const { rows: futurasRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM sie_income
     WHERE empresa_id = $1 AND client_id = $2 AND origin_id = $3
       AND due_date > CURRENT_DATE + INTERVAL '2 months'`,
    [empresaId, clientId, ORIGIN_ID_PADRAO]
  );
  const parcelasFuturasOcultas = futurasRows[0].total;

  // Saldo em aberto deste cliente, já quebrado em Vencido/No mês/A vencer —
  // só aparece aqui no detalhe (a lista de clientes do cluster não mostra
  // saldo, só o rastreio do score).
  const { rows: saldoRows } = await pool.query(
    `SELECT
       COALESCE(SUM(corrected_balance_amount), 0) AS saldo_aberto,
       COALESCE(SUM(corrected_balance_amount) FILTER (WHERE due_date < CURRENT_DATE), 0) AS saldo_vencido,
       COALESCE(SUM(corrected_balance_amount) FILTER (
         WHERE due_date >= CURRENT_DATE AND due_date <= (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')
       ), 0) AS saldo_no_mes,
       COALESCE(SUM(corrected_balance_amount) FILTER (
         WHERE due_date > (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')
       ), 0) AS saldo_a_vencer
     FROM sie_income
     WHERE empresa_id = $1 AND client_id = $2 AND corrected_balance_amount <> 0 AND origin_id = $3`,
    [empresaId, clientId, ORIGIN_ID_PADRAO]
  );
  const saldos = {
    saldo_aberto: Number(saldoRows[0].saldo_aberto),
    saldo_vencido: Number(saldoRows[0].saldo_vencido),
    saldo_no_mes: Number(saldoRows[0].saldo_no_mes),
    saldo_a_vencer: Number(saldoRows[0].saldo_a_vencer),
  };

  const historicoAtual = historico.find((h) => String(h.mes_referencia) === String(atual.mes_referencia)) || historico[0];

  return {
    cliente: atual,
    saldos,
    // Rastreamento completo da simulação (mesmo raciocínio do "Testar com
    // um cliente"): indicadores com nota_0/nota_100/nota/peso/pontos, mais o
    // contexto (mínimo de parcelas, cortes, trava de subida etc.) — é o que
    // deixa auditável, sem margem de dúvida, por que este cliente está
    // neste cluster (ver ClienteClusterDetalhe.jsx).
    breakdown: historicoAtual
      ? {
          indicadores: historicoAtual.indicadores_detalhe?.indicadores || null,
          contexto: historicoAtual.indicadores_detalhe?.contexto || null,
          regra_dura_detalhe: historicoAtual.regra_dura_detalhe,
          subiu_bloqueado_por_trava: historicoAtual.subiu_bloqueado_por_trava,
        }
      : null,
    parcelas: parcelasComAtraso,
    parcelas_futuras_ocultas: parcelasFuturasOcultas,
    historico,
  };
}

module.exports = {
  recalcularClusters,
  getResumo,
  getResumoPorCentroCusto,
  listClientesPorCluster,
  getClienteDetalhe,
  // exportado pra reaproveitar o mesmo filtro de Centro de Custo nas tools
  // de ranking do servidor MCP (ver integracoes-mcp/tools/rankingInadimplencia.js)
  condicaoCentroCusto,
  // exportado só pra teste unitário isolado da matemática de agregação
  agregarCliente,
  aplicarTravaSubida,
  calcularMesReferencia,
};
