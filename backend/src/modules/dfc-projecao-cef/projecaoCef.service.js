const pool = require('../../config/db');
const { projetar, mesDe } = require('./projecaoCef.motor');
const avancosService = require('../dfc-avancos/dfcAvancos.service');
const parametrosService = require('../dfc-parametros/dfcParametros.service');

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Origem Projeção (aba Plano Contas) -> coluna da projeção e sinal no orçamento (saída = negativo,
// pedido do usuário).
const SAIDAS = {
  CEF_NOVO_REGISTRO: { coluna: 'novo_registro', sinal: 1 },
  CEF_MEDICAO: { coluna: 'medicao', sinal: 1 },
  CEF_CREDITO_PJ: { coluna: 'credito_pj', sinal: 1 },
  CEF_JUROS: { coluna: 'juros', sinal: -1 },
  CEF_AMORTIZACAO: { coluna: 'amortizacao', sinal: -1 },
};

const COLUNAS = [
  'pct_obra_executada',
  'delta_pct_obra_mes',
  'qtd_assinatura',
  'vgf_assinatura',
  'qtd_registro',
  'vgf_registro',
  'vgf_medicao',
  'novo_registro',
  'medicao',
  'demanda_atingida',
  'credito_pj',
  'juros',
  'novo_registro_nao_amortizacao',
  'amortizacao',
  'saldo_devedor_pj',
  'mutuario_pf',
  'mutuario_pj',
  'primeiro_cred_pj',
  'valor_maximo_pj',
  'exposicao_garantia',
];

// Parâmetros obrigatórios pro motor (os demais não entram na conta das saídas).
const OBRIGATORIOS = [
  ['cto', 'CTO'],
  ['valor_financiamento_pj', 'Valor do Financiamento PJ'],
  ['pct_coeficiente_garantia', '% Coeficiente da Garantia'],
  ['pct_amortizacao_pj', '% Amortização PJ'],
  ['taxa_juros_mes', 'Taxa de Juros ao Mês'],
  ['data_demanda_minima', 'Data da Demanda Mínima'],
  ['data_inicio_ciclo', 'Data Início do Ciclo'],
  ['data_fim_ciclo', 'Data Fim do Ciclo'],
];

async function versaoVigente(empresaId, siengeId) {
  const { rows } = await pool.query(
    'SELECT MAX(versao) AS v FROM dfc_parametros_versoes WHERE empresa_id = $1 AND sienge_id = $2',
    [empresaId, siengeId]
  );
  return rows[0].v ? parametrosService.getVersao(empresaId, siengeId, rows[0].v) : null;
}

// Obras que entram na projeção: Tipo = Obra e "Projeta DFC" (aba Centros Custos). Pra rodar
// precisa de Código Contrato Caixa e de uma versão dos Parâmetros.
async function elegiveis(empresaId) {
  const { rows } = await pool.query(
    `SELECT c.sienge_id, c.name, c.codigo_contrato_caixa AS contrato,
            (SELECT MAX(versao) FROM dfc_parametros_versoes p WHERE p.empresa_id = c.empresa_id AND p.sienge_id = c.sienge_id) AS versao,
            e.atualizado_em, e.versao_parametros
       FROM centros_custo_sienge c
       LEFT JOIN dfc_projecao_cef_execucao e ON e.empresa_id = c.empresa_id AND e.sienge_id = c.sienge_id
      WHERE c.empresa_id = $1 AND c.natureza = 'OBRA' AND c.projeta_dfc
      ORDER BY c.name ASC`,
    [empresaId]
  );
  return rows.map((r) => ({
    sienge_id: r.sienge_id,
    name: r.name,
    contrato: r.contrato || null,
    versao_parametros: r.versao || null,
    ultima_atualizacao: r.atualizado_em,
    elegivel: Boolean(r.contrato && r.versao),
    motivo: !r.contrato ? 'sem Código Contrato Caixa' : !r.versao ? 'sem Parâmetros publicados' : null,
  }));
}

// % de obra acumulado (0 a 1) de cada mês do ciclo — a mesma regra da linha da obra em Avanços
// Obras (DfcAvancosTab.jsx::consolidado): Caixa (DCD) até o mês anterior ao atual e, do mês atual
// em diante, Prevision (com Prevision) ou o avanço manual (sem). Mês sem valor repete o anterior.
async function obraAcumulado(empresaId, siengeId, inicio, fim) {
  const dados = await avancosService.avancos(empresaId, inicio, fim);
  const obra = dados.obras.find((o) => o.sienge_id === siengeId);
  const mapa = new Map();
  if (!obra) {
    dados.meses.forEach((m) => mapa.set(m, 0));
    return { mapa, cenario: 'SEM_DADOS' };
  }
  const caixa = Boolean(obra.pls);
  const prevision = Boolean(obra.prevision);
  const cenario = caixa && prevision ? 'CAIXA_PREVISION' : caixa ? 'CAIXA' : prevision ? 'PREVISION' : 'MANUAL';
  let ultimo = 0;
  dados.meses.forEach((m) => {
    let v;
    if (cenario === 'CAIXA_PREVISION') v = m < dados.mes_atual ? obra.pls[m] : obra.prevision[m];
    else if (cenario === 'CAIXA') v = m < dados.mes_atual ? obra.pls[m] : obra.manual?.[m];
    else if (cenario === 'PREVISION') v = obra.prevision[m];
    else v = obra.manual?.[m];
    if (v !== null && v !== undefined) ultimo = Math.min(Math.max(Number(v) / 100, 0), 1);
    mapa.set(m, ultimo);
  });
  return { mapa, cenario };
}

// Unidades do Geral do contrato, sem o primeiro contrato por data de assinatura (o da construtora)
// — mesma regra da aba Repasses.
async function unidadesGeral(empresaId, contrato) {
  const { rows } = await pool.query(
    `SELECT data_assinatura_contrato AS data_assinatura, data_inclusao_dados_registro_cri AS data_registro,
            valor_financiamento, valor_financiamento_terreno AS valor_terreno,
            valor_desconto_subsidio_complementar AS valor_subsidio, valor_fgts
       FROM (SELECT u.*, ROW_NUMBER() OVER (ORDER BY u.data_assinatura_contrato ASC NULLS LAST, u.id ASC) AS ordem
               FROM extrato_unidades u
              WHERE u.empresa_id = $1 AND u.contrato_empreendimento = $2) x
      WHERE x.ordem > 1`,
    [empresaId, contrato]
  );
  return rows;
}

function round2(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

// Valor pra gravar: sim/não e quantidades como vêm, % de obra com todas as casas (a coluna guarda
// 8), dinheiro arredondado em centavos.
function valorColuna(coluna, v) {
  if (typeof v === 'boolean' || coluna.startsWith('qtd_')) return v;
  if (coluna === 'pct_obra_executada' || coluna === 'delta_pct_obra_mes') return v;
  return round2(v);
}

// Recalcula e regrava a projeção da obra inteira (todos os meses do ciclo dos Parâmetros vigentes).
async function atualizar(empresaId, siengeId, usuarioId) {
  const lista = await elegiveis(empresaId);
  const obra = lista.find((o) => o.sienge_id === siengeId);
  if (!obra) throw erro(404, 'Obra não encontrada (precisa ser Tipo Obra com "Projeta DFC" marcado).');
  if (!obra.elegivel) throw erro(400, `${obra.name}: ${obra.motivo}.`);

  const versao = await versaoVigente(empresaId, siengeId);
  const faltando = OBRIGATORIOS.filter(([c]) => versao[c] === null || versao[c] === undefined).map(([, r]) => r);
  if (faltando.length) throw erro(400, `${obra.name}: Parâmetros sem ${faltando.join(', ')}.`);

  // Percentuais dos Parâmetros vêm em % (130 = 130%) — o motor trabalha em fração, como a planilha.
  const p = {
    cto: Number(versao.cto),
    tetoPj: Number(versao.valor_financiamento_pj),
    coefGarantia: Number(versao.pct_coeficiente_garantia) / 100,
    amortPj: Number(versao.pct_amortizacao_pj) / 100,
    taxaJuros: Number(versao.taxa_juros_mes) / 100,
    dataDemandaMinima: versao.data_demanda_minima,
    dataInicio: versao.data_inicio_ciclo,
    dataFim: versao.data_fim_ciclo,
    prazoRegistro: Number(versao.tempo_assinatura_registro_meses || 0),
  };

  const { mapa, cenario } = await obraAcumulado(empresaId, siengeId, p.dataInicio, p.dataFim);
  const unidades = await unidadesGeral(empresaId, obra.contrato);
  const linhas = projetar(p, unidades, mapa);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM dfc_projecao_cef WHERE empresa_id = $1 AND sienge_id = $2', [empresaId, siengeId]);
    for (let i = 0; i < linhas.length; i += 100) {
      const lote = linhas.slice(i, i + 100);
      const valores = [];
      const marcadores = lote.map((l, j) => {
        const base = j * (COLUNAS.length + 3);
        valores.push(empresaId, siengeId, `${l.mes}-01`, ...COLUNAS.map((c) => valorColuna(c, l[c])));
        return `(${Array.from({ length: COLUNAS.length + 3 }, (_, k) => `$${base + k + 1}`).join(', ')})`;
      });
      await client.query(
        `INSERT INTO dfc_projecao_cef (empresa_id, sienge_id, mes, ${COLUNAS.join(', ')}) VALUES ${marcadores.join(', ')}`,
        valores
      );
    }
    await client.query(
      `INSERT INTO dfc_projecao_cef_execucao (empresa_id, sienge_id, versao_parametros, unidades, meses, usuario_id, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (empresa_id, sienge_id) DO UPDATE SET versao_parametros = EXCLUDED.versao_parametros,
         unidades = EXCLUDED.unidades, meses = EXCLUDED.meses, usuario_id = EXCLUDED.usuario_id,
         atualizado_em = EXCLUDED.atualizado_em`,
      // Relógio da aplicação (o do Postgres da VPS é deslocado) — aparece no log do Orçamento.
      [empresaId, siengeId, versao.versao, unidades.length, linhas.length, usuarioId, new Date()]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const total = (c) => round2(linhas.reduce((s, l) => s + l[c], 0));
  return {
    sienge_id: siengeId,
    name: obra.name,
    versao_parametros: versao.versao,
    cenario_avanco: cenario,
    meses: linhas.length,
    primeiro_mes: linhas[0]?.mes || null,
    ultimo_mes: linhas[linhas.length - 1]?.mes || null,
    unidades: unidades.length,
    totais: {
      novo_registro: total('novo_registro'),
      medicao: total('medicao'),
      credito_pj: total('credito_pj'),
      juros: total('juros'),
      amortizacao: total('amortizacao'),
    },
  };
}

// Valores da projeção pro Orçamento: cada saída cai na conta analítica com a Origem Projeção
// correspondente (aba Plano Contas) — do plano do próprio centro, se ele tiver versão própria, senão
// do Global. Cada origem CEF fica em uma conta só (índice único em cada plano).
async function orcamento(empresaId) {
  const { rows: contas } = await pool.query(
    `SELECT NULL::int AS centro_id, origem_projecao, sienge_id FROM dfc_plano_contas
      WHERE empresa_id = $1 AND origem_projecao = ANY($2::text[])
     UNION ALL
     SELECT centro_id, origem_projecao, sienge_id FROM dfc_plano_contas_centro
      WHERE empresa_id = $1 AND origem_projecao = ANY($2::text[])`,
    [empresaId, Object.keys(SAIDAS)]
  );
  const { rows: versoes } = await pool.query(
    `SELECT v.centro_id, c.name FROM dfc_plano_contas_versoes v
       JOIN centros_custo_sienge c ON c.empresa_id = v.empresa_id AND c.sienge_id = v.centro_id
      WHERE v.empresa_id = $1`,
    [empresaId]
  );
  // plano -> origem -> conta. Chave 'global' ou o id do centro com versão própria.
  const planos = { global: {} };
  versoes.forEach((v) => {
    planos[v.centro_id] = {};
  });
  contas.forEach((c) => {
    const plano = planos[c.centro_id ?? 'global'];
    if (plano) plano[c.origem_projecao] = c.sienge_id;
  });
  const planoDoCentro = (sid) => planos[sid] || planos.global;

  const { rows } = await pool.query(
    `SELECT sienge_id, to_char(mes, 'YYYY-MM') AS mes, novo_registro, medicao, credito_pj, juros, amortizacao
       FROM dfc_projecao_cef WHERE empresa_id = $1`,
    [empresaId]
  );
  const valores = [];
  rows.forEach((r) => {
    const plano = planoDoCentro(r.sienge_id);
    Object.entries(SAIDAS).forEach(([origem, { coluna, sinal }]) => {
      const conta = plano[origem];
      const v = Number(r[coluna]);
      if (conta !== undefined && v !== 0) valores.push({ sienge_id: r.sienge_id, conta, mes: r.mes, valor: round2(v * sinal) });
    });
  });

  // Aviso de origem sem conta — só nos planos usados por alguma obra projetada.
  const avisos = [];
  const projetados = [...new Set(rows.map((r) => r.sienge_id))];
  const nomeVersao = Object.fromEntries(versoes.map((v) => [v.centro_id, v.name]));
  const planosUsados = new Set(projetados.map((sid) => (planos[sid] ? sid : 'global')));
  planosUsados.forEach((chave) => {
    const onde = chave === 'global' ? 'no plano Global' : `na versão do plano de ${nomeVersao[chave]}`;
    Object.keys(SAIDAS).forEach((origem) => {
      if (planos[chave][origem] === undefined) avisos.push(`Nenhuma conta com a Origem Projeção ${origem} ${onde} (aba Plano Contas).`);
    });
  });

  const { rows: execucoes } = await pool.query(
    `SELECT e.sienge_id, e.atualizado_em, e.versao_parametros, u.nome AS usuario
       FROM dfc_projecao_cef_execucao e LEFT JOIN usuarios u ON u.id = e.usuario_id
      WHERE e.empresa_id = $1`,
    [empresaId]
  );
  return { valores, execucoes, avisos };
}

module.exports = { SAIDAS, elegiveis, atualizar, orcamento, obraAcumulado, mesDe };
