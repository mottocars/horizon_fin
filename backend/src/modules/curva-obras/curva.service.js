const pool = require('../../config/db');
const centrosService = require('../centros-custo-sienge/centros.service');
const periodosService = require('../periodos/periodos.service');

function round2(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function chave(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function gerarEixoMeses(inicio, fim) {
  const meses = [];
  let ano = inicio.ano;
  let mes = inicio.mes;
  while (ano < fim.ano || (ano === fim.ano && mes <= fim.mes)) {
    meses.push({ ano, mes });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

async function getUltimoMesComPls(empresaId, siengeId) {
  const centro = await centrosService.getItem(empresaId, siengeId);
  if (!centro || !centro.codigo_contrato_caixa) return null;

  // O cronograma físico-financeiro do DCD já vem preenchido com valores para
  // TODO o contrato (é um cronograma/planejamento, não um histórico) — por
  // isso a última parcela numerada ali quase sempre é a última do contrato
  // inteiro, o que travaria a calibragem para praticamente todos os meses.
  // O sinal real de "o que já aconteceu" está na liberação: status = 'LP'
  // (liberado) indica parcela efetivamente executada; 'PR' é só previsão.
  const { rows } = await pool.query(
    `SELECT to_char(MAX(data_parcela), 'YYYY-MM') AS ultimo_mes
     FROM dcd_cronograma_liberacao
     WHERE empresa_id = $1 AND numero_contrato = $2
       AND parcela ~ '^[0-9]+$' AND status = 'LP'`,
    [empresaId, centro.codigo_contrato_caixa]
  );
  return rows[0]?.ultimo_mes || null;
}

async function listCentros(empresaId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT c.sienge_id, c.name, c.codigo_contrato_caixa, c.codigo_prevision
     FROM centros_custo_sienge c
     LEFT JOIN centro_custo_etapas_historico h
       ON h.sienge_id = c.sienge_id AND h.empresa_id = c.empresa_id AND h.data_inicio IS NOT NULL
     LEFT JOIN mascara_itens m
       ON m.id = h.mascara_item_id AND m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.descricao = 'Obras'
     WHERE c.empresa_id = $1
       AND ((c.codigo_contrato_caixa IS NOT NULL AND c.codigo_contrato_caixa != '')
         OR (c.codigo_prevision IS NOT NULL AND c.codigo_prevision != '')
         OR m.id IS NOT NULL)
     ORDER BY c.name ASC`,
    [empresaId]
  );
  return rows;
}

async function getCurva(empresaId, siengeId) {
  const centro = await centrosService.getItem(empresaId, siengeId);
  if (!centro) {
    const err = new Error('Centro de custo não encontrado.');
    err.status = 404;
    err.expose = true;
    throw err;
  }

  const showCef = Boolean(centro.codigo_contrato_caixa);
  const showPrevision = Boolean(centro.codigo_prevision);

  let contrato = null;
  if (showCef) {
    const { rows: contratoRows } = await pool.query(
      `SELECT c.numero_contrato, c.nome_empreendimento, c.percentual_obra_executada, u.nome AS enviado_por
       FROM dcd_contratos c
       LEFT JOIN usuarios u ON u.id = c.enviado_por_usuario_id
       WHERE c.empresa_id = $1 AND c.numero_contrato = $2`,
      [empresaId, centro.codigo_contrato_caixa]
    );
    contrato = contratoRows[0] || null;
  }

  const { rows: etapaRows } = await pool.query(
    `SELECT MIN(h.data_inicio) AS data_inicio_obra, MAX(COALESCE(h.data_fim, CURRENT_DATE)) AS data_fim_obra
     FROM mascara_itens m
     JOIN centro_custo_etapas_historico h
       ON h.mascara_item_id = m.id AND h.empresa_id = $1 AND h.sienge_id = $2
     WHERE m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.empresa_id = $1 AND m.descricao = 'Obras'`,
    [empresaId, siengeId]
  );
  const dataInicioObra = etapaRows[0]?.data_inicio_obra || null;
  const dataFimObra = etapaRows[0]?.data_fim_obra || null;

  const plsPorMes = new Map();
  if (contrato) {
    const { rows: cronogramaRows } = await pool.query(
      `SELECT to_char(data_parcela, 'YYYY-MM') AS ano_mes, SUM(percentual_etapa) AS avanco_mes
       FROM dcd_cronograma_fisico_financeiro
       WHERE empresa_id = $1 AND numero_contrato = $2
         AND parcela ~ '^[0-9]+$'
       GROUP BY to_char(data_parcela, 'YYYY-MM')
       ORDER BY to_char(data_parcela, 'YYYY-MM') ASC`,
      [empresaId, centro.codigo_contrato_caixa]
    );
    for (const row of cronogramaRows) {
      const [ano, mes] = row.ano_mes.split('-').map(Number);
      plsPorMes.set(chave(ano, mes), round2(Number(row.avanco_mes || 0)));
    }
  }

  // O cronograma físico-financeiro já traz o planejamento inteiro do contrato
  // preenchido (não só o que já ocorreu) — por isso o corte de "até onde é
  // real" usa a liberação (status = 'LP' = liberado), não a última parcela
  // numerada do físico-financeiro.
  let ultimoMesPls = null;
  if (contrato) {
    const { rows: liberacaoRows } = await pool.query(
      `SELECT to_char(MAX(data_parcela), 'YYYY-MM') AS ultimo_mes
       FROM dcd_cronograma_liberacao
       WHERE empresa_id = $1 AND numero_contrato = $2
         AND parcela ~ '^[0-9]+$' AND status = 'LP'`,
      [empresaId, centro.codigo_contrato_caixa]
    );
    ultimoMesPls = liberacaoRows[0]?.ultimo_mes || null;
  }

  const previsionPorMes = new Map();
  if (showPrevision) {
    const { rows: previsionRows } = await pool.query(
      `SELECT to_char(data, 'YYYY-MM') AS ano_mes, SUM(expected) AS avanco_mes
       FROM prevision_dashboard_monthly_progress
       WHERE empresa_id = $1 AND sienge_id = $2 AND primary_view = $3
       GROUP BY to_char(data, 'YYYY-MM')
       ORDER BY to_char(data, 'YYYY-MM') ASC`,
      [empresaId, siengeId, centro.prevision_primary_view]
    );
    for (const row of previsionRows) {
      const [ano, mes] = row.ano_mes.split('-').map(Number);
      previsionPorMes.set(chave(ano, mes), round2(Number(row.avanco_mes || 0) * 100));
    }
  }

  const { rows: calibragemRows } = await pool.query(
    `SELECT c.ano, c.mes, c.avanco_mes, u.nome AS usuario_nome
     FROM curva_obras_calibragem_manual c
     LEFT JOIN usuarios u ON u.id = c.usuario_id
     WHERE c.empresa_id = $1 AND c.sienge_id = $2`,
    [empresaId, siengeId]
  );
  const calibragemPorMes = new Map();
  for (const row of calibragemRows) {
    calibragemPorMes.set(chave(row.ano, row.mes), {
      avancoMes: round2(Number(row.avanco_mes)),
      usuarioNome: row.usuario_nome,
    });
  }

  const dentroDoPeriodoAberto = await periodosService.estaDentroDoPeriodoAberto(empresaId);

  // Eixo de meses: exatamente o período da etapa "Obras" cadastrada no
  // histórico de etapas do centro de custo — nem mais, nem menos. Dados de
  // PLS/Prevision/calibragem fora desse período não expandem o eixo.
  let limites = [];
  if (dataInicioObra && dataFimObra) {
    limites = [
      { ano: new Date(dataInicioObra).getUTCFullYear(), mes: new Date(dataInicioObra).getUTCMonth() + 1 },
      { ano: new Date(dataFimObra).getUTCFullYear(), mes: new Date(dataFimObra).getUTCMonth() + 1 },
    ];
  }

  let pls = [];
  let totalizador = {
    avancoMesTotal: 0,
    avancoAcumuladoFinal: 0,
    aAvancarFinal: 100,
    previsionMesTotal: 0,
    previsionAcumuladoFinal: 0,
    previsionAAvancarFinal: 100,
    totalCalibragem: 0,
  };

  if (limites.length > 0) {
    const ordenados = [...limites].sort((a, b) => chave(a.ano, a.mes).localeCompare(chave(b.ano, b.mes)));
    const inicio = ordenados[0];
    const fim = ordenados[ordenados.length - 1];
    const eixo = gerarEixoMeses(inicio, fim);

    let acumuladoPls = 0;
    let acumuladoPrevision = 0;
    pls = eixo.map(({ ano, mes }) => {
      const k = chave(ano, mes);
      const avancoMesPls = plsPorMes.has(k) ? plsPorMes.get(k) : 0;
      acumuladoPls += avancoMesPls;

      // Sem medição do Prevision naquele mês conta como 0.
      const avancoMesPrevision = previsionPorMes.has(k) ? previsionPorMes.get(k) : 0;
      acumuladoPrevision += avancoMesPrevision;

      const manual = calibragemPorMes.get(k);
      // Calibragem manual só é permitida a partir do mês seguinte à última PAR
      // numerada lida no DCD — não a partir do mês atual. Meses até essa última
      // leitura ficam travados na PLS (mesmo quando é 0 por falta de medição
      // naquele mês específico, cercada por medições reais antes/depois).
      const calibragemBloqueada =
        (ultimoMesPls !== null && k <= ultimoMesPls) || !dentroDoPeriodoAberto;
      const avancoMesCalibragem = calibragemBloqueada
        ? avancoMesPls
        : manual
          ? manual.avancoMes
          : avancoMesPrevision;

      const desvio = round2(avancoMesCalibragem - avancoMesPrevision);

      return {
        ano,
        mes,
        pls: {
          avancoMes: avancoMesPls,
          avancoAcumulado: round2(acumuladoPls),
          aAvancar: round2(Math.max(0, 100 - acumuladoPls)),
        },
        prevision: {
          avancoMes: avancoMesPrevision,
          avancoAcumulado: round2(acumuladoPrevision),
          aAvancar: round2(Math.max(0, 100 - acumuladoPrevision)),
        },
        calibragemManual: avancoMesCalibragem,
        calibragemBloqueada,
        calibradoPor: calibragemBloqueada ? null : manual?.usuarioNome || null,
        desvioPlsPrevision: desvio,
      };
    });

    // O total usa apenas até o último mês realmente lido no DCD — meses
    // seguintes podem ter PLS/Prevision previstos e inflar o acumulado, então
    // não entram nesse "retrato" do progresso real. Sem DCD, usa o eixo todo.
    const linhasAteUltimaLeitura =
      ultimoMesPls !== null ? pls.filter((p) => chave(p.ano, p.mes) <= ultimoMesPls) : pls;
    const ultimoAteHoje = linhasAteUltimaLeitura[linhasAteUltimaLeitura.length - 1];
    totalizador = {
      avancoMesTotal: round2(pls.reduce((soma, p) => soma + (p.pls.avancoMes || 0), 0)),
      avancoAcumuladoFinal: ultimoAteHoje ? ultimoAteHoje.pls.avancoAcumulado : 0,
      aAvancarFinal: ultimoAteHoje ? ultimoAteHoje.pls.aAvancar : 100,
      previsionMesTotal: round2(pls.reduce((soma, p) => soma + (p.prevision.avancoMes || 0), 0)),
      previsionAcumuladoFinal: ultimoAteHoje ? ultimoAteHoje.prevision.avancoAcumulado : 0,
      previsionAAvancarFinal: ultimoAteHoje ? ultimoAteHoje.prevision.aAvancar : 100,
      totalCalibragem: round2(pls.reduce((soma, p) => soma + (p.calibragemManual || 0), 0)),
    };
  }

  return {
    vinculado: true,
    centro: { sienge_id: centro.sienge_id, name: centro.name },
    showCef,
    showPrevision,
    contrato: contrato
      ? {
          numero_contrato: contrato.numero_contrato,
          nome_empreendimento: contrato.nome_empreendimento,
          percentual_obra_executada: contrato.percentual_obra_executada,
        }
      : null,
    enviadoPor: contrato?.enviado_por || null,
    dataInicioObra,
    dataFimObra,
    etapasCadastradas: Boolean(dataInicioObra && dataFimObra),
    pls,
    totalizador,
  };
}

async function validarDentroDoPeriodo(empresaId) {
  const dentroDoPeriodoAberto = await periodosService.estaDentroDoPeriodoAberto(empresaId);
  if (!dentroDoPeriodoAberto) {
    const err = new Error('Só é possível editar enquanto a data de hoje estiver dentro do período aberto da empresa.');
    err.status = 400;
    err.expose = true;
    throw err;
  }
}

async function salvarCalibragem(empresaId, siengeId, { ano, mes, avancoMes }, usuarioId) {
  const ultimoMesPls = await getUltimoMesComPls(empresaId, siengeId);
  const chaveAlvo = chave(ano, mes);

  if (ultimoMesPls !== null && chaveAlvo <= ultimoMesPls) {
    const err = new Error(
      'Só é possível calibrar manualmente meses após a última medição (PAR) lida no DCD.'
    );
    err.status = 400;
    err.expose = true;
    throw err;
  }

  await validarDentroDoPeriodo(empresaId);

  await pool.query(
    `INSERT INTO curva_obras_calibragem_manual (empresa_id, sienge_id, ano, mes, avanco_mes, usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (empresa_id, sienge_id, ano, mes)
     DO UPDATE SET avanco_mes = EXCLUDED.avanco_mes, usuario_id = EXCLUDED.usuario_id, atualizado_em = NOW()`,
    [empresaId, siengeId, ano, mes, avancoMes, usuarioId]
  );
}

module.exports = { listCentros, getCurva, salvarCalibragem };
