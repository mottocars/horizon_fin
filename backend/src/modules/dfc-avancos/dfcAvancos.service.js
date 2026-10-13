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
// Obras = centros com Tipo = Obra e "Projeta DFC" marcado (aba Centros Custos).
async function avancos(empresaId, inicio, fim) {
  const meses = mesesEntre(inicio, fim);
  const { rows: hoje } = await pool.query("SELECT to_char(CURRENT_DATE, 'YYYY-MM') AS mes");
  const mesAtual = hoje[0].mes;

  const { rows: obras } = await pool.query(
    `SELECT sienge_id, name, codigo_contrato_caixa, codigo_prevision, prevision_primary_view
       FROM centros_custo_sienge
      WHERE empresa_id = $1 AND natureza = 'OBRA' AND projeta_dfc
      ORDER BY name ASC`,
    [empresaId]
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
    `SELECT sienge_id, primary_view, to_char(data, 'YYYY-MM') AS mes, SUM(expected) AS avanco
       FROM prevision_dashboard_monthly_progress
      WHERE empresa_id = $1
      GROUP BY 1, 2, 3`,
    [empresaId]
  );

  const plsPorContrato = {};
  pls.forEach((r) => {
    plsPorContrato[r.numero_contrato] = plsPorContrato[r.numero_contrato] || {};
    plsPorContrato[r.numero_contrato][r.mes] = Number(r.avanco || 0);
  });
  const ultimoLiberado = Object.fromEntries(liberado.map((r) => [r.numero_contrato, r.ultimo_mes]));

  return {
    meses,
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

      const porMesPrev = {};
      prevision
        .filter((r) => r.sienge_id === o.sienge_id && r.primary_view === o.prevision_primary_view)
        .forEach((r) => {
          porMesPrev[r.mes] = Number(r.avanco || 0) * 100;
        });
      const previsionAcumulado = Object.keys(porMesPrev).length ? acumulado(porMesPrev, meses) : null;

      return {
        sienge_id: o.sienge_id,
        name: o.name,
        contrato,
        codigo_prevision: o.codigo_prevision || null,
        ultimo_mes_liberado: ultimoMes,
        pls: plsAcumulado,
        prevision: previsionAcumulado,
      };
    }),
  };
}

module.exports = { avancos };
