const pool = require('../../config/db');

function round2(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function num(v) {
  return v === null || v === undefined ? 0 : Number(v);
}

// Operações > DFC Construtoras > aba Repasses: as unidades do Geral dos Empreendimentos
// (extrato_unidades) de cada empreendimento — centro de custo com Código Contrato Caixa — sem o
// primeiro contrato por data de assinatura (é o da própria construtora), com as colunas
// calculadas pedidas pelo usuário:
//   % Obra Acumulado    = avanço PLS acumulado (DCD) no mês da data de registro — mesma conta da
//                         aba Avanços Obras (dfc-avancos): até o último mês liberado, parado depois
//   VGF                 = financiamento + subsídio + FGTS
//   Medição Total       = (financiamento − terreno) + subsídio
//   Novo Registro       = terreno + subsídio
//   Medição             = Medição Total × % Obra Acumulado
//   Novo Registro Total = Novo Registro + Medição
//   Demanda Mínima      = data de assinatura antes da "Data da Demanda Mínima" (versão vigente dos
//                         Parâmetros da obra; sem versão, a Dt Término Suspensiva do DCD)
async function repasses(empresaId) {
  const { rows: centros } = await pool.query(
    `SELECT sienge_id, name, codigo_contrato_caixa AS contrato
       FROM centros_custo_sienge
      WHERE empresa_id = $1 AND COALESCE(codigo_contrato_caixa, '') <> ''
      ORDER BY name ASC`,
    [empresaId]
  );
  const contratos = centros.map((c) => c.contrato);
  if (contratos.length === 0) return [];

  const { rows: unidades } = await pool.query(
    `SELECT * FROM (
       SELECT u.id, u.contrato_empreendimento, u.numero_contrato_unidade, u.nome_mutuario,
              u.data_assinatura_contrato, u.data_inclusao_dados_registro_cri AS data_registro,
              u.valor_financiamento, u.valor_financiamento_terreno AS valor_terreno,
              u.valor_desconto_subsidio_complementar AS valor_subsidio, u.valor_fgts,
              u.valor_avaliacao_imovel AS valor_avaliacao,
              ROW_NUMBER() OVER (PARTITION BY u.contrato_empreendimento
                                 ORDER BY u.data_assinatura_contrato ASC NULLS LAST, u.id ASC) AS ordem
         FROM extrato_unidades u
        WHERE u.empresa_id = $1 AND u.contrato_empreendimento = ANY($2::text[])
     ) x
     WHERE x.ordem > 1
     ORDER BY x.data_assinatura_contrato ASC NULLS LAST, x.nome_mutuario ASC`,
    [empresaId, contratos]
  );

  const { rows: pls } = await pool.query(
    `SELECT numero_contrato, to_char(data_parcela, 'YYYY-MM') AS mes, SUM(percentual_etapa) AS avanco
       FROM dcd_cronograma_fisico_financeiro
      WHERE empresa_id = $1 AND numero_contrato = ANY($2::text[]) AND parcela ~ '^[0-9]+$'
      GROUP BY 1, 2`,
    [empresaId, contratos]
  );
  const { rows: liberado } = await pool.query(
    `SELECT numero_contrato, to_char(MAX(data_parcela), 'YYYY-MM') AS ultimo_mes
       FROM dcd_cronograma_liberacao
      WHERE empresa_id = $1 AND numero_contrato = ANY($2::text[]) AND parcela ~ '^[0-9]+$' AND status = 'LP'
      GROUP BY 1`,
    [empresaId, contratos]
  );
  const { rows: demandaParam } = await pool.query(
    `SELECT DISTINCT ON (sienge_id) sienge_id, data_demanda_minima
       FROM dfc_parametros_versoes
      WHERE empresa_id = $1
      ORDER BY sienge_id, versao DESC`,
    [empresaId]
  );
  const { rows: demandaDcd } = await pool.query(
    `SELECT numero_contrato, data_termino_suspensiva FROM dcd_contratos
      WHERE empresa_id = $1 AND numero_contrato = ANY($2::text[])`,
    [empresaId, contratos]
  );

  const plsPorContrato = {};
  pls.forEach((r) => {
    plsPorContrato[r.numero_contrato] = plsPorContrato[r.numero_contrato] || {};
    plsPorContrato[r.numero_contrato][r.mes] = Number(r.avanco || 0);
  });
  const ultimoLiberado = Object.fromEntries(liberado.map((r) => [r.numero_contrato, r.ultimo_mes]));
  const demandaPorCentro = Object.fromEntries(demandaParam.map((r) => [r.sienge_id, r.data_demanda_minima]));
  const demandaPorContrato = Object.fromEntries(demandaDcd.map((r) => [r.numero_contrato, r.data_termino_suspensiva]));

  // % acumulado do PLS no mês do registro (parado no último mês liberado, se o registro for depois).
  function pctObra(contrato, dataRegistro) {
    const porMes = plsPorContrato[contrato];
    const ultimo = ultimoLiberado[contrato];
    if (!dataRegistro || !porMes || !ultimo) return null;
    const mesRegistro = String(dataRegistro).slice(0, 7);
    const ate = mesRegistro <= ultimo ? mesRegistro : ultimo;
    return round2(Object.keys(porMes).filter((m) => m <= ate).reduce((s, m) => s + porMes[m], 0));
  }

  return centros.map((c) => {
    const demanda = demandaPorCentro[c.sienge_id] || demandaPorContrato[c.contrato] || null;
    const origemDemanda = demandaPorCentro[c.sienge_id] ? 'PARAMETROS' : demandaPorContrato[c.contrato] ? 'DCD' : null;
    return {
      sienge_id: c.sienge_id,
      name: c.name,
      contrato: c.contrato,
      data_demanda_minima: demanda,
      origem_demanda_minima: origemDemanda,
      tem_dcd: Boolean(ultimoLiberado[c.contrato]),
      unidades: unidades
        .filter((u) => u.contrato_empreendimento === c.contrato)
        .map((u) => {
          const fin = num(u.valor_financiamento);
          const terreno = num(u.valor_terreno);
          const subsidio = num(u.valor_subsidio);
          const fgts = num(u.valor_fgts);
          const pct = pctObra(c.contrato, u.data_registro);
          const medicaoTotal = round2(fin - terreno + subsidio);
          const novoRegistro = round2(terreno + subsidio);
          const medicao = pct === null ? null : round2((medicaoTotal * pct) / 100);
          return {
            id: u.id,
            contrato_mutuario: u.numero_contrato_unidade,
            mutuario: u.nome_mutuario,
            data_assinatura: u.data_assinatura_contrato,
            data_registro: u.data_registro,
            valor_financiamento: fin,
            valor_terreno: terreno,
            valor_subsidio: subsidio,
            valor_fgts: fgts,
            valor_avaliacao: u.valor_avaliacao === null ? null : Number(u.valor_avaliacao),
            pct_obra_acumulado: pct,
            vgf: round2(fin + subsidio + fgts),
            medicao_total: medicaoTotal,
            novo_registro: novoRegistro,
            medicao,
            novo_registro_total: medicao === null ? null : round2(novoRegistro + medicao),
            demanda_minima: demanda && u.data_assinatura_contrato ? u.data_assinatura_contrato < demanda : null,
          };
        }),
    };
  });
}

module.exports = { repasses };
