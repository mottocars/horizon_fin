const pool = require('../../config/db');

function round2(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

// 'AAAA-MM' de cada mês entre as duas datas ('AAAA-MM-DD'), inclusive.
function mesesEntre(inicio, fim) {
  const meses = [];
  let [ano, mes] = inicio.slice(0, 7).split('-').map(Number);
  const [anoFim, mesFim] = fim.slice(0, 7).split('-').map(Number);
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

function mesAnterior(anoMes) {
  const [ano, mes] = anoMes.split('-').map(Number);
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, '0')}`;
}

// Acumulado até cada mês da lista, a partir de { 'AAAA-MM': avanço do mês } (soma tudo que veio
// antes, inclusive meses anteriores ao período pedido).
function acumulado(porMes, meses) {
  const ordenados = Object.keys(porMes).sort();
  return Object.fromEntries(
    meses.map((m) => [m, round2(ordenados.filter((k) => k <= m).reduce((soma, k) => soma + porMes[k], 0))])
  );
}

// Operações > DFC Construtoras > Avanços Obras: o avanço acumulado de cada obra, mês a mês, nas
// duas fontes — mesma conta da antiga tela Curva de Obras (curva-obras/curva.service.js):
// - PLS (Caixa): % de cada parcela do cronograma físico-financeiro do DCD do Contrato Caixa da
//   obra, somado por mês. É o REALIZADO: conta só até o último mês com parcela liberada (status
//   'LP' no cronograma de liberação) e fica parado nesse acumulado depois dele; mês futuro = null.
// - Prevision: % previsto por mês (prevision_dashboard_monthly_progress.expected, na visão
//   primária/secundária escolhida no cadastro do centro de custo).
// - Manual: % acumulado informado à mão por mês (dfc_avanco_manual) — a tela usa quando a obra
//   não tem Prevision (ver os cenários em DfcAvancosTab.jsx).
// - Encadeado (obra com Caixa e Prevision, do mês atual em diante — pedido do usuário, 19/10/2026): o
//   acumulado da Caixa no mês anterior ao atual + o avanço DO MÊS do Prevision (não o acumulado dele),
//   mês a mês, entre 0 e 100%. Assim a diferença entre as duas fontes não cai inteira no mês atual. O
//   avanço do mês sai da diferença entre os acumulados do Prevision (os mesmos valores da linha
//   Prevision), pra conta bater com a do dossiê Excel. É o que a linha da obra e a Projeção CEF usam.
//   Com o Prevision à frente da Caixa, a obra termina abaixo de 100% (a diferença não é compensada em
//   mês nenhum) — decisão do usuário; com a Caixa à frente, chega a 100% antes e para.
// Obras = centros com Tipo = Obra e "Projeta DFC" marcado (aba Centros Custos). `todasObras`: todas as
// de Tipo = Obra, marcadas ou não — a "Curva de avanço por obra" do dashboard Obra 360º (pedido do
// usuário: toda obra com Prevision tem curva; o "Projeta DFC" só decide quem entra na projeção do caixa).
async function avancos(empresaId, inicio, fim, { todasObras = false } = {}) {
  const meses = mesesEntre(inicio, fim);
  const { rows: hoje } = await pool.query("SELECT to_char(CURRENT_DATE, 'YYYY-MM') AS mes");
  const mesAtual = hoje[0].mes;

  const { rows: obras } = await pool.query(
    `SELECT sienge_id, name, apelido, codigo_contrato_caixa, codigo_prevision, prevision_primary_view
       FROM centros_custo_sienge
      WHERE empresa_id = $1 AND natureza = 'OBRA' AND (projeta_dfc OR $2::boolean)
      ORDER BY name ASC`,
    [empresaId, todasObras]
  );

  const { rows: pls } = await pool.query(
    `SELECT numero_contrato, to_char(data_parcela, 'YYYY-MM') AS mes, SUM(percentual_etapa) AS avanco
       FROM dcd_cronograma_fisico_financeiro
      WHERE empresa_id = $1 AND parcela ~ '^[0-9]+$'
      GROUP BY 1, 2`,
    [empresaId]
  );
  const { rows: liberado } = await pool.query(
    `SELECT numero_contrato, to_char(MAX(data_parcela), 'YYYY-MM') AS ultimo_mes
       FROM dcd_cronograma_liberacao
      WHERE empresa_id = $1 AND parcela ~ '^[0-9]+$' AND status = 'LP'
      GROUP BY 1`,
    [empresaId]
  );
  const { rows: prevision } = await pool.query(
    `SELECT sienge_id, primary_view, to_char(data, 'YYYY-MM') AS mes, SUM(expected) AS avanco,
            SUM(base) AS base, SUM(realized) AS realizado
       FROM prevision_dashboard_monthly_progress
      WHERE empresa_id = $1
      GROUP BY 1, 2, 3`,
    [empresaId]
  );

  const { rows: manual } = await pool.query(
    `SELECT sienge_id, to_char(mes, 'YYYY-MM') AS mes, percentual
       FROM dfc_avanco_manual
      WHERE empresa_id = $1 AND to_char(mes, 'YYYY-MM') BETWEEN $2 AND $3`,
    [empresaId, meses[0], meses[meses.length - 1]]
  );

  const plsPorContrato = {};
  pls.forEach((r) => {
    plsPorContrato[r.numero_contrato] = plsPorContrato[r.numero_contrato] || {};
    plsPorContrato[r.numero_contrato][r.mes] = Number(r.avanco || 0);
  });
  const ultimoLiberado = Object.fromEntries(liberado.map((r) => [r.numero_contrato, r.ultimo_mes]));

  return {
    meses,
    mes_atual: mesAtual,
    obras: obras.map((o) => {
      const contrato = o.codigo_contrato_caixa || null;
      const porMesPls = contrato ? plsPorContrato[contrato] : null;
      const ultimoMes = contrato ? ultimoLiberado[contrato] || null : null;
      // Realizado no mês m = acumulado até o último mês liberado (ou até m, se for antes) — depois
      // da última liberação ele fica parado (ex.: obra já terminada continua em 100%). Mês
      // futuro (depois do mês atual) não tem realizado: null.
      let plsAcumulado = null;
      if (porMesPls && ultimoMes) {
        const acc = acumulado(porMesPls, [...meses, ultimoMes]);
        plsAcumulado = Object.fromEntries(
          meses.map((m) => [m, m > mesAtual ? null : m <= ultimoMes ? acc[m] : acc[ultimoMes]])
        );
      }

      // Prevision só vale com o "Código Prevision" preenchido na aba Centros Custos: tirar o código
      // devolve a obra pro avanço manual, mesmo com dados antigos do Prevision gravados (pedido do usuário).
      const temPrevision = Boolean(o.codigo_prevision && String(o.codigo_prevision).trim());
      const porMesPrev = {};
      prevision
        .filter((r) => temPrevision && r.sienge_id === o.sienge_id && r.primary_view === o.prevision_primary_view)
        .forEach((r) => {
          porMesPrev[r.mes] = Number(r.avanco || 0) * 100;
        });
      const previsionAcumulado = Object.keys(porMesPrev).length ? acumulado(porMesPrev, meses) : null;
      // Os dois orçamentos do Prevision, cada um no seu acumulado (Avanço das Obras do Obra 360º —
      // pedido do usuário: Caixa × orçamento primário × orçamento secundário). Orçamento sem avanço
      // nenhum (tudo zero) = a obra não tem esse orçamento: null.
      const previsionDaVisao = (primaria) => {
        const porMes = {};
        prevision
          .filter((r) => temPrevision && r.sienge_id === o.sienge_id && r.primary_view === primaria)
          .forEach((r) => {
            porMes[r.mes] = Number(r.avanco || 0) * 100;
          });
        return Object.values(porMes).some((v) => v > 0) ? acumulado(porMes, meses) : null;
      };

      // As três curvas de cada orçamento do Prevision (Base, Previsto e Realizado), cada uma no seu
      // acumulado — o drilldown do Avanço das Obras (Obra 360º). O realizado para no último mês com
      // avanço, sem passar do mês atual (depois dele o Prevision grava zero, não "sem medição").
      const detalheDaVisao = (primaria) => {
        const linhas = prevision.filter((r) => temPrevision && r.sienge_id === o.sienge_id && r.primary_view === primaria);
        const curva = (campo, corte) => {
          const porMes = {};
          linhas.forEach((r) => {
            porMes[r.mes] = Number(r[campo] || 0) * 100;
          });
          if (!Object.values(porMes).some((v) => v > 0)) return null;
          const acc = acumulado(porMes, meses);
          if (!corte) return acc;
          const ultimo = Object.keys(porMes).filter((k) => porMes[k] > 0 && k <= mesAtual).sort().pop() || null;
          return Object.fromEntries(meses.map((m) => [m, ultimo && m <= ultimo ? acc[m] : null]));
        };
        return { base: curva('base', false), previsto: curva('avanco', false), realizado: curva('realizado', true) };
      };

      let encadeado = null;
      if (plsAcumulado && previsionAcumulado && meses[meses.length - 1] >= mesAtual) {
        const antes = mesAnterior(mesAtual);
        // Caixa no mês anterior ao atual (parada no último mês liberado, se ele for antes).
        const base = acumulado(porMesPls, [ultimoMes < antes ? ultimoMes : antes]);
        const ate = meses[meses.length - 1];
        const mesesPrev = mesesEntre(`${antes}-01`, `${ate}-01`);
        const prevAcc = acumulado(porMesPrev, mesesPrev);
        let v = Object.values(base)[0];
        encadeado = {};
        mesesPrev.slice(1).forEach((m, i) => {
          v = Math.min(Math.max(v + (prevAcc[m] - prevAcc[mesesPrev[i]]), 0), 100);
          if (meses.includes(m)) encadeado[m] = round2(v);
        });
      }

      return {
        sienge_id: o.sienge_id,
        name: o.name,
        apelido: o.apelido || null,
        contrato,
        codigo_prevision: o.codigo_prevision || null,
        ultimo_mes_liberado: ultimoMes,
        pls: plsAcumulado,
        prevision: previsionAcumulado,
        prevision_primaria: previsionDaVisao(true),
        prevision_secundaria: previsionDaVisao(false),
        prevision_detalhe: { primaria: detalheDaVisao(true), secundaria: detalheDaVisao(false) },
        encadeado,
        manual: Object.fromEntries(
          manual.filter((r) => r.sienge_id === o.sienge_id).map((r) => [r.mes, Number(r.percentual)])
        ),
      };
    }),
  };
}

// Obra 360º › Avanço das Obras (visões Mensal, Semanal e Diária — pedido do usuário): as curvas de
// cada obra por DATA, para a tela agrupar no mês, na semana (terminando no sábado) ou no dia. Cada
// curva é uma lista [['AAAA-MM-DD', % acumulado], ...] só com os dias em que o valor muda (vale até o
// próximo ponto). Toda obra de Tipo = Obra com Prevision (como o ?obras=todas de `avancos`).
// - PLS (Caixa): o % acumulado do cronograma físico-financeiro do DCD, só as parcelas já liberadas
//   (a mesma parcela com status 'LP' no cronograma de liberação — a "285" e outras que não estão no
//   físico-financeiro não contam) e sem passar de hoje. `ultima_liberacao` é a data de liberação da
//   última delas ("até 21/10/2026" na tela).
// - Prevision (orçamento primário e secundário): Previsto e Realizado da curva S diária
//   (prevision_dashboard_scurve, fração 0–1 → %); sem a curva S, cai no mensal acumulado
//   (prevision_dashboard_monthly_progress). O realizado para em hoje (a curva S repete o último valor
//   nos dias futuros). Orçamento com o previsto todo zero = a obra não tem esse orçamento: null.
async function curvasPorData(empresaId) {
  const { rows: hojeRows } = await pool.query("SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS hoje");
  const hoje = hojeRows[0].hoje;

  // Quando cada coluna da tela foi atualizada (pedido do usuário — embaixo do título de cada coluna):
  // PLS = o último envio do DCD (importação do PDF); as curvas do Prevision = a última sincronização de
  // cada orçamento. As colunas são TIMESTAMP sem fuso gravadas no fuso do banco (Brasília no local, UTC na
  // VPS): convertidas para Brasília aqui.
  const brasilia = (expr) =>
    `to_char((${expr}) AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YY HH24:MI')`;
  const { rows: atualiz } = await pool.query(
    `SELECT ${brasilia('SELECT MAX(GREATEST(importado_em, atualizado_em)) FROM dcd_contratos WHERE empresa_id = $1')} AS pls,
            ${brasilia('SELECT MAX(importado_em) FROM prevision_dashboard_scurve WHERE empresa_id = $1 AND primary_view')} AS primaria,
            ${brasilia('SELECT MAX(importado_em) FROM prevision_dashboard_scurve WHERE empresa_id = $1 AND NOT primary_view')} AS secundaria`,
    [empresaId]
  );

  const { rows: obras } = await pool.query(
    `SELECT sienge_id, name, apelido, codigo_contrato_caixa, codigo_prevision
       FROM centros_custo_sienge
      WHERE empresa_id = $1 AND natureza = 'OBRA'
      ORDER BY name ASC`,
    [empresaId]
  );
  const { rows: fisico } = await pool.query(
    `SELECT numero_contrato, parcela, to_char(data_parcela, 'YYYY-MM-DD') AS data, percentual_etapa AS avanco
       FROM dcd_cronograma_fisico_financeiro
      WHERE empresa_id = $1 AND parcela ~ '^[0-9]+$'
      ORDER BY numero_contrato, data_parcela, parcela`,
    [empresaId]
  );
  const { rows: liberado } = await pool.query(
    `SELECT numero_contrato, parcela, to_char(MAX(data_parcela), 'YYYY-MM-DD') AS data
       FROM dcd_cronograma_liberacao
      WHERE empresa_id = $1 AND parcela ~ '^[0-9]+$' AND status = 'LP'
      GROUP BY 1, 2`,
    [empresaId]
  );
  const { rows: scurve } = await pool.query(
    `SELECT sienge_id, primary_view, to_char(data, 'YYYY-MM-DD') AS data, expected, realized
       FROM prevision_dashboard_scurve
      WHERE empresa_id = $1
      ORDER BY sienge_id, primary_view, data`,
    [empresaId]
  );
  const { rows: mensal } = await pool.query(
    `SELECT sienge_id, primary_view, to_char(data, 'YYYY-MM-DD') AS data, SUM(expected) AS expected, SUM(realized) AS realized
       FROM prevision_dashboard_monthly_progress
      WHERE empresa_id = $1
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3`,
    [empresaId]
  );

  const agrupar = (linhas, chave) => {
    const mapa = new Map();
    linhas.forEach((r) => {
      const k = chave(r);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(r);
    });
    return mapa;
  };
  const fisicoPorContrato = agrupar(fisico, (r) => r.numero_contrato);
  const liberadaEm = new Map(liberado.map((r) => [`${r.numero_contrato}|${r.parcela}`, r.data]));
  const scurvePorObra = agrupar(scurve, (r) => `${r.sienge_id}|${r.primary_view}`);
  const mensalPorObra = agrupar(mensal, (r) => `${r.sienge_id}|${r.primary_view}`);

  // Só os pontos em que o valor muda.
  const enxugar = (pontos) => pontos.filter((p, i) => i === 0 || p[1] !== pontos[i - 1][1]);

  const curvaPrevision = (siengeId, primaria) => {
    const k = `${siengeId}|${primaria}`;
    let previsto;
    let realizado;
    if (scurvePorObra.has(k)) {
      const linhas = scurvePorObra.get(k);
      previsto = linhas.map((r) => [r.data, round2(Number(r.expected || 0) * 100)]);
      realizado = linhas.filter((r) => r.data <= hoje).map((r) => [r.data, round2(Number(r.realized || 0) * 100)]);
    } else if (mensalPorObra.has(k)) {
      // Mensal: o acumulado no último dia de cada mês; o realizado do mês corrente vale até hoje.
      let p = 0;
      let rz = 0;
      previsto = [];
      realizado = [];
      mensalPorObra.get(k).forEach((r) => {
        p += Number(r.expected || 0) * 100;
        rz += Number(r.realized || 0) * 100;
        previsto.push([r.data, round2(p)]);
        if (`${r.data.slice(0, 7)}-01` <= hoje) realizado.push([r.data < hoje ? r.data : hoje, round2(rz)]);
      });
    } else return null;
    if (!previsto.some((p) => p[1] > 0)) return null;
    return {
      previsto: enxugar(previsto),
      realizado: realizado.some((p) => p[1] > 0) ? enxugar(realizado) : null,
    };
  };

  return {
    hoje,
    atualizacoes: atualiz[0],
    obras: obras
      .map((o) => {
        const temPrevision = Boolean(o.codigo_prevision && String(o.codigo_prevision).trim());
        const primaria = temPrevision ? curvaPrevision(o.sienge_id, true) : null;
        const secundaria = temPrevision ? curvaPrevision(o.sienge_id, false) : null;
        if (!primaria && !secundaria) return null;

        const contrato = o.codigo_contrato_caixa || null;
        let pls = null;
        if (contrato && fisicoPorContrato.has(contrato)) {
          let acc = 0;
          let ultima = null;
          const pontos = [];
          fisicoPorContrato.get(contrato).forEach((r) => {
            const lib = liberadaEm.get(`${contrato}|${r.parcela}`);
            if (!lib || r.data > hoje) return;
            acc += Number(r.avanco || 0);
            pontos.push([r.data, round2(Math.min(acc, 100))]);
            if (!ultima || lib > ultima) ultima = lib;
          });
          if (pontos.length) pls = { ultima_liberacao: ultima, pontos: enxugar(pontos) };
        }

        return {
          sienge_id: o.sienge_id,
          name: o.name,
          apelido: o.apelido || null,
          contrato,
          pls,
          primaria,
          secundaria,
        };
      })
      .filter(Boolean),
  };
}

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Grava (ou apaga, com percentual null) o avanço acumulado manual de uma obra num mês 'AAAA-MM'.
async function salvarManual(empresaId, siengeId, mes, percentual, usuarioId) {
  const { rows: centro } = await pool.query(
    'SELECT natureza, projeta_dfc FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2',
    [empresaId, siengeId]
  );
  if (!centro[0]) throw erro(404, 'Centro de custo não encontrado nesta empresa.');
  if (centro[0].natureza !== 'OBRA' || !centro[0].projeta_dfc) {
    throw erro(400, 'Avanço só para obras com "Projeta DFC" marcado (aba Centros Custos).');
  }
  const dia1 = `${mes}-01`;
  if (percentual === null) {
    await pool.query('DELETE FROM dfc_avanco_manual WHERE empresa_id = $1 AND sienge_id = $2 AND mes = $3', [
      empresaId,
      siengeId,
      dia1,
    ]);
    return { mes, percentual: null };
  }
  await pool.query(
    `INSERT INTO dfc_avanco_manual (empresa_id, sienge_id, mes, percentual, usuario_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (empresa_id, sienge_id, mes)
     DO UPDATE SET percentual = EXCLUDED.percentual, usuario_id = EXCLUDED.usuario_id, atualizado_em = NOW()`,
    [empresaId, siengeId, dia1, percentual, usuarioId]
  );
  return { mes, percentual };
}

module.exports = { avancos, curvasPorData, salvarManual };
