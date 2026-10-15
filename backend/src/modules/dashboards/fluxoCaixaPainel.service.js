const pool = require('../../config/db');
const fluxoService = require('../dfc-fluxo/fluxo.service');
const dfcSaldos = require('../dfc-saldos/dfcSaldos.service');

// Dados do Fluxo de Caixa do dashboard Econômico Financeiro — o painel do CFO
// (C:\Users\motta\Desktop\layout\Especificação do Painel do CFO — Tostes e Diniz.md) montado com as
// mesmas consultas da especificação, direto no banco (e não pelo conector MCP). O cálculo dos
// indicadores, do simulador e dos gráficos fica no navegador (EconomicoFinanceiro/fluxo/modelo.js),
// porque o simulador recalcula a cada movimento.
// `hist`: meses de histórico antes do mês atual; `hor`: meses de horizonte contando o mês atual.
// `centros`: filtro de centros de custo — aplicado no fluxo e nas maiores saídas; o resto vem com
// todos os centros e o navegador filtra (como na especificação).

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
  const ultimoRealizado = fluxoService.somarMeses(m0, -1);
  const d1 = (m) => `${m}-01`;
  const filtroCentros = centros.length ? centros : null;

  const [fluxo, contas, centrosRows, real, proj, cef, param, carteira, forn, versao, empresa] = await Promise.all([
    fluxoService.montar(empresaId, { inicio: ini, fim, centros }),
    dfcSaldos.saldosPorConta(empresaId, [m0]),
    pool.query(
      `SELECT cc.sienge_id AS id, cc.name AS nome, cc.company_id, cc.company_name, cc.codigo_contrato_caixa AS contrato, cc.projeta_dfc,
              (SELECT max(p.versao) FROM dfc_parametros_versoes p WHERE p.empresa_id = cc.empresa_id AND p.sienge_id = cc.sienge_id) AS param_versao
         FROM centros_custo_sienge cc WHERE cc.empresa_id = $1 ORDER BY cc.sienge_id`,
      [empresaId]
    ),
    hist > 0 ? pool.query(sqlOperacional('real'), [empresaId, d1(ini), d1(ultimoRealizado)]) : { rows: [] },
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
       UNION ALL
       SELECT 'pagar',
              round(sum(balance_amount) FILTER (WHERE due_date < $2::date), 2),
              count(*) FILTER (WHERE due_date < $2::date),
              round(sum(balance_amount) FILTER (WHERE due_date >= $2::date AND due_date < $3::date), 2),
              round(sum(balance_amount) FILTER (WHERE due_date >= $2::date), 2)
         FROM sie_outcome WHERE empresa_id = $1 AND balance_amount > 0`,
      [empresaId, d1(m0), d1(fluxoService.somarMeses(m0, 3))]
    ),
    hist > 0
      ? pool.query(
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
          [empresaId, d1(ini), d1(ultimoRealizado), filtroCentros]
        )
      : { rows: [] },
    pool.query(
      `SELECT v.numero, v.criado_em, u.nome AS usuario FROM dfc_orcamento_versoes v LEFT JOIN usuarios u ON u.id = v.usuario_id
        WHERE v.empresa_id = $1 ORDER BY v.numero DESC LIMIT 1`,
      [empresaId]
    ),
    pool.query(`SELECT COALESCE(NULLIF(nome_fantasia, ''), razao_social) AS nome FROM empresas WHERE id = $1`, [empresaId]),
  ]);

  // Numérico vem como texto do pg: converte, menos as colunas de texto (nomes, meses, contas).
  const numeros = (rows, texto = []) =>
    rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, !texto.includes(k) && typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v]))
    );
  return {
    m0,
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
      saldo: Number(c.saldos[m0] ?? 0),
    })),
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
