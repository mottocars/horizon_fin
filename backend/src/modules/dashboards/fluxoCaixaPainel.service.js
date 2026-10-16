const pool = require('../../config/db');
const fluxoService = require('../dfc-fluxo/fluxo.service');
const dfcSaldos = require('../dfc-saldos/dfcSaldos.service');
const { hojeEmBrasilia } = require('../extrato-contas-sienge/extratoContas-api.client');

// Dados do Fluxo de Caixa do dashboard Econômico Financeiro — o painel do CFO
// (C:\Users\motta\Desktop\layout\Especificação do Painel do CFO — Tostes e Diniz.md) montado com as
// mesmas consultas da especificação, direto no banco (e não pelo conector MCP). O cálculo dos
// indicadores, do simulador e dos gráficos fica no navegador (EconomicoFinanceiro/fluxo/modelo.js),
// porque o simulador recalcula a cada movimento.
// `hist`: meses de histórico antes do mês atual; `hor`: meses de horizonte contando o mês atual.
// `centros`: filtro de centros de custo — aplicado no fluxo e nas maiores saídas; o resto vem com
// todos os centros e o navegador filtra (como na especificação).
// ATUALIDADE (pedido do usuário): o painel é a foto de hoje. Saldos, carteira e realizado vão até HOJE
// (o extrato é buscado até o dia da última atualização); o Orçamento (última versão salva) só entra no
// que ainda vai acontecer: os meses seguintes e, no mês atual, o que FALTA — orçado do mês − realizado
// até hoje, por centro × natureza, sem inverter o sinal (`restante`).

// 'AAAA-MM-DD' + n dias.
function somarDias(data, n) {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

// Árvore do fluxo sem as contas (o painel trabalha até a máscara 2).
function fluxoSimples(f) {
  return {
    colunas: f.colunas.map((c) => `${c.mes}|${c.tipo}`),
    estrutura: f.estrutura.map((n1) => ({
      descricao: n1.descricao,
      porColuna: n1.porColuna,
      lados: n1.lados.map((l) => ({
        chave: l.chave,
        porColuna: l.porColuna,
        filhos: l.filhos.map((n2) => ({ descricao: n2.descricao, porColuna: n2.porColuna })),
      })),
    })),
    saldoInicial: f.porColuna.saldoInicial,
    saldoFinal: f.porColuna.saldoFinal,
    resultado: f.porColuna.resultado,
  };
}

// O que falta acontecer no mês atual, por centro × natureza classificada: orçado (versão salva) menos o
// realizado até hoje. Entrada orçada: max(orçado − realizado, 0); saída orçada: min(orçado − realizado, 0)
// — o que já passou do orçado não volta como sobra. Natureza sem orçamento no mês: nada a acontecer.
// Devolve [{ centro_id, n1, n2, valor }] (somado por centro × máscara 1 × máscara 2).
async function restanteDoMes(empresaId, mes, cls) {
  const [{ rows: orc }, { rows: real }] = await Promise.all([
    pool.query(
      `SELECT centro_id, sienge_id, valor FROM dfc_orcamento_valores WHERE empresa_id = $1 AND mes = $2::date`,
      [empresaId, `${mes}-01`]
    ),
    pool.query(
      `SELECT r.centro_id, r.natureza_id AS sienge_id, sum(r.valor) AS valor
         FROM sie_extrato_contas_rateio r
         JOIN contas_bancarias_sienge c ON c.empresa_id = r.empresa_id AND c.company_id = r.company_id AND c.numero_conta = r.numero_conta AND c.projeta_dfc
        WHERE r.empresa_id = $1 AND r.mes = $2::date AND r.centro_id IS NOT NULL AND r.natureza_id IS NOT NULL
        GROUP BY 1, 2`,
      [empresaId, `${mes}-01`]
    ),
  ]);
  const realizado = new Map(real.map((r) => [`${r.centro_id}|${r.sienge_id}`, Number(r.valor)]));
  const soma = new Map();
  orc.forEach((o) => {
    const p = Number(o.valor);
    const r = realizado.get(`${o.centro_id}|${o.sienge_id}`) || 0;
    const falta = p > 0 ? Math.max(p - r, 0) : p < 0 ? Math.min(p - r, 0) : 0;
    if (!falta) return;
    const c = cls.classificar(o.centro_id, o.sienge_id);
    if (!c) return; // fora do fluxo (sem máscara) — como no DFC
    const k = `${o.centro_id}|${c.n1}|${c.n2}`;
    soma.set(k, (soma.get(k) || 0) + falta);
  });
  return [...soma].map(([k, valor]) => {
    const [centro, n1, n2] = k.split('|').map(Number);
    return { centro_id: centro, n1: cls.nomeMascara[n1], n2: cls.nomeMascara[n2], valor: Math.round(valor * 100) / 100 };
  });
}

// Fluxo operacional (máscara 1 com "OPERACIONAL") por centro e mês — realizado (extrato rateado das
// contas com Projeta DFC) ou projetado (versão salva do Orçamento).
function sqlOperacional(base) {
  const realizado = base === 'real';
  return `
    SELECT x.centro_id AS id, to_char(x.mes, 'YYYY-MM') AS mes,
           round(sum(x.valor) FILTER (WHERE x.valor > 0), 2) AS ent,
           round(sum(x.valor) FILTER (WHERE x.valor < 0), 2) AS sai,
           round(sum(x.valor) FILTER (WHERE m2.descricao ILIKE '%FINANCIAMENTO%'), 2) AS captacao
      FROM ${realizado ? 'sie_extrato_contas_rateio' : 'dfc_orcamento_valores'} x
      ${
        realizado
          ? `JOIN contas_bancarias_sienge c ON c.empresa_id = x.empresa_id AND c.company_id = x.company_id AND c.numero_conta = x.numero_conta AND c.projeta_dfc`
          : ''
      }
      JOIN dfc_plano_contas pc ON pc.empresa_id = x.empresa_id AND pc.sienge_id = x.${realizado ? 'natureza_id' : 'sienge_id'}
      JOIN dfc_mascaras m2 ON m2.id = pc.mascara_id
      JOIN dfc_mascaras m1 ON m1.id = m2.parent_id
     WHERE x.empresa_id = $1 AND x.mes BETWEEN $2::date AND $3::date AND m1.descricao ILIKE '%OPERACIONAL%'
     GROUP BY 1, 2 ORDER BY 1, 2`;
}

async function painel(empresaId, { hist, hor, centros = [] }) {
  const m0 = fluxoService.mesDeHoje();
  const ini = fluxoService.somarMeses(m0, -hist);
  const fim = fluxoService.somarMeses(m0, hor - 1);
  const hoje = hojeEmBrasilia();
  const d1 = (m) => `${m}-01`;
  const filtroCentros = centros.length ? centros : null;
  const cls = await fluxoService.classificador(empresaId);

  const [fluxo, contas, centrosRows, real, proj, cef, param, carteira, forn, versao, empresa, restante] = await Promise.all([
    fluxoService.montar(empresaId, { inicio: ini, fim, centros }),
    // Abertura do mês atual e saldo de hoje (= abertura do mês seguinte: o extrato vai até hoje).
    dfcSaldos.saldosPorConta(empresaId, [m0, fluxoService.somarMeses(m0, 1)]),
    pool.query(
      `SELECT cc.sienge_id AS id, cc.name AS nome, cc.company_id, cc.company_name, cc.codigo_contrato_caixa AS contrato, cc.projeta_dfc,
              (SELECT max(p.versao) FROM dfc_parametros_versoes p WHERE p.empresa_id = cc.empresa_id AND p.sienge_id = cc.sienge_id) AS param_versao
         FROM centros_custo_sienge cc WHERE cc.empresa_id = $1 ORDER BY cc.sienge_id`,
      [empresaId]
    ),
    pool.query(sqlOperacional('real'), [empresaId, d1(ini), d1(m0)]),
    pool.query(sqlOperacional('proj'), [empresaId, d1(m0), d1(fim)]),
    pool.query(
      `SELECT p.sienge_id AS id, to_char(p.mes, 'YYYY-MM') AS mes, round(p.pct_obra_executada * 100, 2) AS obra,
              round(p.novo_registro, 2) AS novo_registro, round(p.medicao, 2) AS medicao, round(p.credito_pj, 2) AS credito,
              round(p.juros, 2) AS juros, round(p.amortizacao, 2) AS amort, round(p.saldo_devedor_pj, 2) AS saldo, p.qtd_registro AS registros
         FROM dfc_projecao_cef p WHERE p.empresa_id = $1 ORDER BY 1, 2`,
      [empresaId]
    ),
    pool.query(
      `SELECT p.sienge_id AS id, p.versao, p.numero_unidades, p.valor_financiamento_pj AS teto, p.taxa_juros_mes, p.pct_amortizacao_pj,
              (SELECT count(*) FROM extrato_unidades u JOIN centros_custo_sienge c ON c.empresa_id = u.empresa_id AND c.codigo_contrato_caixa = u.contrato_empreendimento
                WHERE c.empresa_id = p.empresa_id AND c.sienge_id = p.sienge_id) AS unid_geral,
              (SELECT count(*) FROM extrato_unidades u JOIN centros_custo_sienge c ON c.empresa_id = u.empresa_id AND c.codigo_contrato_caixa = u.contrato_empreendimento
                WHERE c.empresa_id = p.empresa_id AND c.sienge_id = p.sienge_id AND u.data_inclusao_dados_registro_cri IS NOT NULL) AS unid_registradas
         FROM dfc_parametros_versoes p
        WHERE p.empresa_id = $1 AND p.versao = (SELECT max(p2.versao) FROM dfc_parametros_versoes p2 WHERE p2.empresa_id = p.empresa_id AND p2.sienge_id = p.sienge_id)
        ORDER BY 1`,
      [empresaId]
    ),
    pool.query(
      `SELECT 'receber' AS lado,
              round(sum(balance_amount) FILTER (WHERE due_date < $2::date), 2) AS vencido,
              count(*) FILTER (WHERE due_date < $2::date) AS n_vencido,
              round(sum(balance_amount) FILTER (WHERE due_date >= $2::date AND due_date < $3::date), 2) AS d90,
              round(sum(balance_amount) FILTER (WHERE due_date >= $2::date), 2) AS a_vencer
         FROM sie_income WHERE empresa_id = $1 AND balance_amount > 0
         -- vencido = até ontem; d90 = de hoje até hoje + 90 dias; a vencer = de hoje em diante
       UNION ALL
       SELECT 'pagar',
              round(sum(balance_amount) FILTER (WHERE due_date < $2::date), 2),
              count(*) FILTER (WHERE due_date < $2::date),
              round(sum(balance_amount) FILTER (WHERE due_date >= $2::date AND due_date < $3::date), 2),
              round(sum(balance_amount) FILTER (WHERE due_date >= $2::date), 2)
         FROM sie_outcome WHERE empresa_id = $1 AND balance_amount > 0`,
      [empresaId, hoje, somarDias(hoje, 90)]
    ),
    pool.query(
          `SELECT e.description AS nome, m2.descricao AS mascara, round(sum(r.valor), 2) AS valor, count(*) AS n
             FROM sie_extrato_contas_rateio r
             JOIN sie_extrato_contas e ON e.registro_id = r.registro_id
             JOIN contas_bancarias_sienge c ON c.empresa_id = r.empresa_id AND c.company_id = r.company_id AND c.numero_conta = r.numero_conta AND c.projeta_dfc
             JOIN dfc_plano_contas pc ON pc.empresa_id = r.empresa_id AND pc.sienge_id = r.natureza_id
             JOIN dfc_mascaras m2 ON m2.id = pc.mascara_id
             JOIN dfc_mascaras m1 ON m1.id = m2.parent_id
            WHERE r.empresa_id = $1 AND r.valor < 0 AND r.mes BETWEEN $2::date AND $3::date AND m1.descricao ILIKE '%OPERACIONAL%'
              AND ($4::int[] IS NULL OR r.centro_id = ANY($4::int[]))
            GROUP BY e.description, m2.descricao ORDER BY sum(r.valor) LIMIT 40`,
          [empresaId, d1(ini), d1(m0), filtroCentros]
        ),
    pool.query(
      `SELECT v.numero, v.criado_em, u.nome AS usuario FROM dfc_orcamento_versoes v LEFT JOIN usuarios u ON u.id = v.usuario_id
        WHERE v.empresa_id = $1 ORDER BY v.numero DESC LIMIT 1`,
      [empresaId]
    ),
    pool.query(`SELECT COALESCE(NULLIF(nome_fantasia, ''), razao_social) AS nome FROM empresas WHERE id = $1`, [empresaId]),
    restanteDoMes(empresaId, m0, cls),
  ]);

  // Numérico vem como texto do pg: converte, menos as colunas de texto (nomes, meses, contas).
  const numeros = (rows, texto = []) =>
    rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, !texto.includes(k) && typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v]))
    );
  return {
    m0,
    hoje,
    hist,
    hor,
    meses: { ini, fim },
    info: {
      empresa: empresa.rows[0]?.nome || null,
      extratoAte: fluxo.extratoAte,
      versao: versao.rows[0] ? { numero: versao.rows[0].numero, criado_em: versao.rows[0].criado_em, usuario: versao.rows[0].usuario } : null,
    },
    fluxo: fluxoSimples(fluxo),
    contas: contas.map((c) => ({
      empresa: c.company_name,
      company_id: c.company_id,
      conta: c.numero_conta,
      nome: c.nome,
      tipo: c.tipo_descricao || '',
      saldo_abertura: Number(c.saldos[m0] ?? 0),
      saldo: Number(c.saldos[fluxoService.somarMeses(m0, 1)] ?? 0), // hoje
    })),
    // Mês atual: o que falta acontecer (orçado − realizado até hoje), com a máscara 1 e 2.
    restante: filtroCentros ? restante.filter((r) => filtroCentros.includes(r.centro_id)) : restante,
    centros: numeros(centrosRows.rows, ['nome', 'company_name', 'contrato']),
    real: numeros(real.rows, ['mes']),
    proj: numeros(proj.rows, ['mes']),
    cef: numeros(cef.rows, ['mes']),
    param: numeros(param.rows),
    carteira: Object.fromEntries(numeros(carteira.rows, ['lado']).map((r) => [r.lado, r])),
    forn: numeros(forn.rows, ['nome', 'mascara']),
  };
}

module.exports = { painel };
