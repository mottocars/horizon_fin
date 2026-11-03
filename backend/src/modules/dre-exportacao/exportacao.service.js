const pool = require('../../config/db');
const demonstrativo = require('../dre-demonstrativo/demonstrativo.service');
const mascarasService = require('../dre-mascaras/dreMascaras.service');
const financeiro = require('../dre-financeiro/financeiro.service');
const correcoes = require('../dre-correcoes/correcoes.service');

const { motor, meses, vespera, CALCULOS_RECEITA } = demonstrativo;

// Exportação de auditoria da DRE (Operações › DRE Gerencial): tudo o que fez a DRE de um período chegar
// em cada valor, pra conferir antes de entregar ao CFO. Usa o MESMO motor da aba DRE
// (demonstrativo.service.js::motor) — a DRE do sistema, a memória de cálculo (cada linha × centro ×
// mês: base acumulada × fator), as POCs de cada obra em cada data e as bases, linha a linha (Financeiro,
// Unidades, Correções, Orçamento), mais o plano de contas aplicado, o que ficou fora da DRE no período
// e os alertas de dados. A planilha (exportacao.excel.js) refaz a conta em fórmulas a partir das bases.

const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const doFinanceiro = (x) => x.origem === 'FINANCEIRO' && x.calculo === 'ENTRADAS_SAIDAS';

// Base de cada cálculo de receita: a coluna da aba Base Unidades / Base Correções que ele soma.
const BASE_RECEITA = {
  VALOR_VENDAS: { fonte: 'UNID', coluna: 'venda', texto: 'vendas (todo contrato, até o cancelado depois; data do contrato, valor × participação)' },
  RECEITA_PERMUTA: { fonte: 'UNID', coluna: 'permuta', texto: 'permutas (data e valor da avaliação)' },
  ESTORNO_VENDAS: { fonte: 'UNID', coluna: 'estorno', texto: '−valor dos contratos distratados (data do distrato)' },
  RECEITA_DISTRATO: { fonte: 'UNID', coluna: 'distrato_liquido', texto: 'recebido − devolvido nos distratos (data do distrato)' },
  CORRECAO_MONETARIA: { fonte: 'CORR', coluna: 'total', texto: 'correção monetária (paga + reparcelada + em aberto, pelo vencimento da parcela)' },
};

// Regra de cada linha de nível 2, na mesma ordem de decisão de reconhecidoNoCentro:
//   fator — o que multiplica a base acumulada: POC de Receita, POC de Despesa, POC de Despesa − fração
//           distratada, fração distratada, ou nenhum (1);
//   base  — de onde vem a base: Financeiro (máscaras `mascaras`, com `sinal`), Unidades ou Correções.
function regraDa(x, m) {
  if (x.origem === 'IMPOSTO_FIXO') return { tipo: 'RET', curto: 'Imposto fixo', texto: '−alíquota × soma das linhas acima dela na DRE, no mês' };
  if (!m.calculavel(x)) {
    const motivo =
      CALCULOS_RECEITA.has(x.calculo) && x.realiza_poc && x.tipo_poc === 'RECEITA'
        ? 'POC de Receita não configurada (aba Configurações)'
        : 'sem Origem/Cálculo válido na aba Máscaras';
    return { tipo: 'SEM_CALCULO', curto: 'Sem cálculo', texto: `Sem cálculo: ${motivo}` };
  }
  const fin = (fator, curto, texto, mascaras = [x.id], sinal = 1) => ({
    tipo: 'FIN',
    fator,
    base: { fonte: 'FIN', mascaras, sinal },
    curto,
    texto,
  });
  if (m.custoCiv(x)) return fin('POC_DESPESA', 'POC de Despesa', 'Lançado na máscara (acumulado) × POC de Despesa (fração vendida + permutada)');
  if (m.comPocDespesa(x))
    return fin('POC_DESPESA_LIQ', 'POC Despesa − distratos', 'Lançado na máscara (acumulado) × (POC de Despesa − fração distratada)');
  if (doFinanceiro(x) && !x.realiza_poc) return fin(null, 'Sem POC (emissão)', 'Lançado na máscara no mês (emissão do título; data do movimento no extrato)');
  if (x.calculo === 'ESTORNO_CUSTO') {
    const grupo = m.custosDoGrupo(x);
    return fin(
      'DISTRATADA',
      'Fração distratada',
      `−custos do grupo (${grupo.map((y) => y.descricao).join(', ') || 'nenhum'}) acumulados × fração distratada`,
      grupo.map((y) => y.id),
      -1
    );
  }
  const b = BASE_RECEITA[x.calculo];
  const poc = m.comPocReceita(x);
  return {
    tipo: 'RECEITA',
    fator: poc ? 'POC_RECEITA' : null,
    base: { fonte: b.fonte, coluna: b.coluna },
    curto: poc ? 'POC de Receita' : 'Sem POC',
    texto: poc ? `Base acumulada de ${b.texto} × POC de Receita` : `Base de ${b.texto}, no mês`,
  };
}

// Alíquota (%) vigente num mês, pelo histórico do imposto (como em calcular).
function aliquotas(m) {
  const historico = new Map();
  m.aliquotas.forEach((h) => {
    if (!historico.has(h.mascara_id)) historico.set(h.mascara_id, []);
    historico.get(h.mascara_id).push({ inicio: h.inicio, aliquota: num(h.aliquota) });
  });
  return (mascaraId, data) => (historico.get(mascaraId) || []).filter((h) => h.inicio <= data).pop() || null;
}

// Unidades do motor (aba Unidades, só os centros pedidos) como eventos da Base Unidades — cada um com a
// coluna que alimenta cada cálculo preenchida (as outras vazias).
function eventosUnidades(m) {
  const linhas = [];
  m.unidadesPorCentro.forEach((c) => {
    const comum = (u) => ({ centro_id: c.id, unidade: u.unidade, tipo: u.tipo, situacao: u.situacao_atual, fracao: u.fracao_ideal });
    c.clusters.vendidas.forEach((v) =>
      linhas.push({
        ...comum(v),
        evento: 'Venda',
        data: v.data,
        contrato: v.contrato?.numero ?? v.contrato?.id ?? null,
        cancelado: v.contrato?.cancelado ? 'Sim' : 'Não',
        participacao: v.participacao,
        venda: v.valor === null ? null : num(v.valor),
        fracao_vendida: v.fracao_ideal === null ? null : num(v.fracao_ideal) * v.participacao,
      })
    );
    c.clusters.distratadas.forEach((d) =>
      linhas.push({
        ...comum(d),
        evento: 'Distrato',
        data: d.data,
        contrato: d.contrato?.numero ?? d.contrato?.id ?? null,
        cancelado: 'Sim',
        motivo: d.contrato?.motivo || null,
        participacao: d.participacao,
        estorno: d.valor === null ? null : -num(d.valor),
        recebido: d.receita_distrato,
        devolvido: d.despesa_distrato,
        distrato_liquido: d.receita_distrato === null && d.despesa_distrato === null ? null : num(d.receita_distrato) + num(d.despesa_distrato),
        fracao_distratada: d.fracao_ideal === null ? null : num(d.fracao_ideal) * d.participacao,
      })
    );
    c.clusters.permuta.forEach((p) =>
      linhas.push({
        ...comum(p),
        evento: 'Permuta',
        data: p.data,
        permuta: p.valor === null ? null : num(p.valor),
        fracao_permuta: p.fracao_ideal === null ? null : num(p.fracao_ideal),
      })
    );
    c.clusters.disponiveis.forEach((d) => linhas.push({ ...comum(d), evento: 'Estoque', data: null, estimado: d.valor }));
  });
  return linhas;
}

async function dados(empresaId, { de, ate, centros = [] }) {
  const m = await motor(empresaId, { ate, filtro: centros });
  const regras = new Map(m.mascaras.map((x) => [x.id, regraDa(x, m)]));
  // Máscaras do Financeiro que a DRE usa (as linhas com base no Financeiro e a da POC de Receita).
  const mascarasFin = [
    ...new Set([
      ...(m.mascaraPoc && m.mascaras.some((x) => m.comPocReceita(x) && m.calculavel(x)) ? [m.mascaraPoc.id] : []),
      ...[...regras.values()].filter((r) => r.base?.fonte === 'FIN').flatMap((r) => r.base.mascaras),
    ]),
  ];
  const filtrado = centros.length > 0;

  const [resultado, arvore, financeiroLinhas, fora, corr, orcamento, plano, centrosInfo, extras] = await Promise.all([
    demonstrativo.calcular(empresaId, { de, ate, centros }, m),
    mascarasService.list(empresaId),
    m.ids.length && mascarasFin.length ? financeiro.linhasAuditoria(empresaId, { mascaraIds: mascarasFin, centros: m.ids, ate }) : [],
    financeiro.foraDaDre(empresaId, { de, ate, centros: filtrado ? m.ids : null, mascarasUsadas: mascarasFin }),
    m.ids.length ? correcoes.parcelasDaDre(empresaId, m.ids, ate) : [],
    pool.query(
      `SELECT v.sienge_id::int AS centro_id, to_char(v.data_inicio, 'YYYY-MM-DD') AS inicio, c.nome AS categoria, v.valor,
              v.atualizado_em
         FROM dre_orcamento_valores v LEFT JOIN dre_categorias_orcamento c ON c.id = v.categoria_id
        WHERE v.empresa_id = $1 AND v.data_inicio <= $2 AND v.sienge_id = ANY($3::int[])
        ORDER BY v.sienge_id, v.data_inicio, c.nome`,
      [empresaId, ate, m.ids]
    ),
    // Plano de contas que vale pra cada centro: toda conta analítica, com a Máscara DRE, "NÃO ENTRA NA
    // DRE" ou sem classificação.
    pool.query(
      `SELECT c.sienge_id::int AS centro_id, CASE WHEN v.centro_id IS NULL THEN 'Global' ELSE 'Próprio do centro' END AS plano,
              pf.sienge_id::text AS natureza_id, pf.name AS natureza_nome,
              CASE WHEN v.centro_id IS NULL THEN pg.mascara_id ELSE pc.mascara_id END AS mascara_id,
              CASE WHEN v.centro_id IS NULL THEN pg.nao_entra ELSE pc.nao_entra END AS nao_entra
         FROM centros_custo_sienge c
         LEFT JOIN dre_plano_contas_versoes v ON v.empresa_id = c.empresa_id AND v.centro_id = c.sienge_id
         JOIN planos_financeiros_sienge pf ON pf.empresa_id = c.empresa_id AND pf.tp_conta <> 'T'
         LEFT JOIN dre_plano_contas_centro pc ON pc.empresa_id = c.empresa_id AND pc.centro_id = c.sienge_id AND pc.sienge_id = pf.sienge_id
         LEFT JOIN dre_plano_contas pg ON pg.empresa_id = c.empresa_id AND pg.sienge_id = pf.sienge_id
        WHERE c.empresa_id = $1 AND c.sienge_id = ANY($2::int[])
        ORDER BY c.dre_ordem ASC NULLS LAST, c.sienge_id ASC, pf.sienge_id`,
      [empresaId, m.ids]
    ),
    pool.query(
      `SELECT sienge_id::int AS id, name AS nome, NULLIF(TRIM(apelido), '') AS apelido, natureza, realiza_dre,
              EXISTS (SELECT 1 FROM dre_plano_contas_versoes v WHERE v.empresa_id = c.empresa_id AND v.centro_id = c.sienge_id) AS plano_proprio
         FROM centros_custo_sienge c WHERE empresa_id = $1 AND sienge_id = ANY($2::int[])`,
      [empresaId, m.ids]
    ),
    pool.query(
      `SELECT (SELECT COALESCE(NULLIF(TRIM(nome_fantasia), ''), razao_social) FROM empresas WHERE id = $1) AS empresa,
              (SELECT MAX(atualizado_em) FROM sie_income WHERE empresa_id = $1) AS receber,
              (SELECT MAX(atualizado_em) FROM sie_outcome WHERE empresa_id = $1) AS pagar,
              (SELECT MAX(criado_em) FROM sie_extrato_contas WHERE empresa_id = $1) AS extrato,
              (SELECT MAX(criado_em) FROM sie_sales_contracts WHERE empresa_id = $1) AS contratos,
              (SELECT MAX(criado_em) FROM sie_units WHERE empresa_id = $1) AS unidades,
              (SELECT json_agg(json_build_object('documento', d.documento, 'em', d.criado_em, 'por', u.nome) ORDER BY d.documento)
                 FROM dre_documentos_excluidos d LEFT JOIN usuarios u ON u.id = d.usuario_id WHERE d.empresa_id = $1) AS documentos_fora,
              (SELECT json_agg(json_build_object('documento', documento, 'nome', nome)) FROM (
                 SELECT TRIM(document_identification_id) AS documento, MAX(document_identification_name) AS nome
                   FROM sie_income WHERE empresa_id = $1 GROUP BY 1
                 UNION
                 SELECT TRIM(document_identification_id), MAX(document_identification_name)
                   FROM sie_outcome WHERE empresa_id = $1 GROUP BY 1) d) AS nomes_documentos`,
      [empresaId]
    ),
  ]);

  // Pontos em que a POC é tirada: a véspera do período e o fim de cada mês (o último pode ser parcial).
  const intervalos = meses(de, ate);
  const pontos = [vespera(de), ...intervalos.map(([, b]) => b)];
  const aliquotaEm = aliquotas(m);

  return {
    de,
    ate,
    filtrado,
    m,
    regras,
    mascarasFin,
    intervalos,
    pontos,
    aliquotaEm,
    resultado,
    arvore,
    financeiro: financeiroLinhas,
    fora,
    correcoes: corr,
    orcamento: orcamento.rows.map((r) => ({ ...r, valor: num(r.valor) })),
    plano: plano.rows,
    centros: new Map(centrosInfo.rows.map((c) => [c.id, c])),
    unidades: eventosUnidades(m),
    extras: extras.rows[0],
  };
}

module.exports = { dados, BASE_RECEITA };
