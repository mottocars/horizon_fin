const pool = require('../../config/db');

// Operações > DRE Gerencial > Financeiro: os exercícios (anos) da empresa, do ano do primeiro
// lançamento financeiro até o ano atual. O primeiro ano sai do menor VENCIMENTO do contas a receber
// (sie_income) e a pagar (sie_outcome): a emissão tem datas digitadas erradas no Sienge (títulos da
// TOSTE E DINIZ emitidos em "2002" que vencem em 2026) e jogaria o primeiro exercício décadas pra
// trás. Dentro do exercício, porém, os títulos entram pela EMISSÃO (pedido do usuário) — a contagem
// de cada card e a listagem (lancamentos) são por emissão; título emitido antes do primeiro
// exercício não aparece em nenhum. O card conta TÍTULOS distintos (um título tem várias parcelas) a
// receber e a pagar, e as movimentações do extrato sem título (cada lançamento uma vez, mesmo
// rateado em vários centros) — mesmo critério do movimento na listagem (com natureza) — e quantos
// lançamentos (títulos e movimentos) têm ajuste (lancamentos_ajustes), pela emissão / data, e quantos
// foram criados à mão no ano (lancamentos_manuais). Só lançamentos com alguma linha (original ou
// ajustada) em centro com "Realiza DRE", como a listagem.
// O exercício do ano atual vem travado (`travado`, pedido do usuário): só visualização — nenhuma
// ação que altere dados pode valer pra ele (o backend deve recusar, não só a tela esconder).
async function exercicios(empresaId) {
  const { rows: inicio } = await pool.query(
    `SELECT LEAST((SELECT MIN(due_date) FROM sie_income WHERE empresa_id = $1),
                  (SELECT MIN(due_date) FROM sie_outcome WHERE empresa_id = $1)) AS primeiro`,
    [empresaId]
  );
  // Ano atual pelo relógio da aplicação (o do Postgres da VPS é deslocado).
  const anoAtual = new Date().getFullYear();
  const primeiro = inicio[0].primeiro;
  if (!primeiro) return { primeiro_vencimento: null, ano_atual: anoAtual, exercicios: [] };
  const primeiroAno = Math.min(Number(String(primeiro).slice(0, 4)), anoAtual);

  const { rows } = await pool.query(
    `WITH ativos AS (SELECT sienge_id AS id FROM centros_custo_sienge WHERE empresa_id = $1 AND realiza_dre)
     SELECT EXTRACT(YEAR FROM data)::int AS ano,
            COUNT(DISTINCT id) FILTER (WHERE tipo = 'R')::int AS receber,
            COUNT(DISTINCT id) FILTER (WHERE tipo = 'P')::int AS pagar,
            COUNT(DISTINCT id) FILTER (WHERE tipo = 'E')::int AS movimentos
       FROM (SELECT 'R' AS tipo, t.bill_id AS id, t.issue_date AS data FROM sie_income t
              WHERE t.empresa_id = $1 AND t.issue_date >= $2 AND t.issue_date < $3
                AND (EXISTS (SELECT 1 FROM sie_income_categorias c JOIN ativos a ON a.id = c.cost_center_id
                              WHERE c.bill_id = t.bill_id AND c.installment_id = t.installment_id AND c.empresa_id = t.empresa_id)
                     OR EXISTS (SELECT 1 FROM lancamentos_ajustes j JOIN ativos a ON a.id = j.centro_id
                                 WHERE j.empresa_id = $1 AND j.origem = 'R' AND j.chave = t.bill_id))
             UNION ALL
             SELECT 'P', t.bill_id, t.issue_date FROM sie_outcome t
              WHERE t.empresa_id = $1 AND t.issue_date >= $2 AND t.issue_date < $3
                AND (EXISTS (SELECT 1 FROM sie_outcome_categorias c JOIN ativos a ON a.id = c.cost_center_id
                              WHERE c.bill_id = t.bill_id AND c.installment_id = t.installment_id AND c.empresa_id = t.empresa_id)
                     OR EXISTS (SELECT 1 FROM lancamentos_ajustes j JOIN ativos a ON a.id = j.centro_id
                                 WHERE j.empresa_id = $1 AND j.origem = 'P' AND j.chave = t.bill_id))
             UNION ALL
             SELECT 'E', r.registro_id, r.data FROM sie_extrato_contas_rateio r
               JOIN sie_extrato_contas e ON e.registro_id = r.registro_id
              WHERE r.empresa_id = $1 AND r.mes >= $2 AND r.mes < $3 AND r.data >= $2 AND r.data < $3
                AND e.bill_id IS NULL AND r.natureza_id IS NOT NULL
                AND (r.centro_id IN (SELECT id FROM ativos)
                     OR EXISTS (SELECT 1 FROM lancamentos_ajustes j JOIN ativos a ON a.id = j.centro_id
                                 WHERE j.empresa_id = $1 AND j.origem = 'E' AND j.chave = e.id))) t
      GROUP BY 1`,
    [empresaId, `${primeiroAno}-01-01`, `${anoAtual + 1}-01-01`]
  );
  const { rows: ajustados } = await pool.query(
    `WITH ativos AS (SELECT sienge_id AS id FROM centros_custo_sienge WHERE empresa_id = $1 AND realiza_dre)
     SELECT EXTRACT(YEAR FROM data)::int AS ano, COUNT(*)::int AS n
       FROM (SELECT a.origem, a.chave, MIN(t.issue_date) AS data
               FROM (SELECT DISTINCT origem, chave FROM lancamentos_ajustes WHERE empresa_id = $1 AND origem = 'R' AND centro_id IN (SELECT id FROM ativos)) a
               JOIN sie_income t ON t.bill_id = a.chave AND t.empresa_id = $1 GROUP BY 1, 2
             UNION ALL
             SELECT a.origem, a.chave, MIN(t.issue_date)
               FROM (SELECT DISTINCT origem, chave FROM lancamentos_ajustes WHERE empresa_id = $1 AND origem = 'P' AND centro_id IN (SELECT id FROM ativos)) a
               JOIN sie_outcome t ON t.bill_id = a.chave AND t.empresa_id = $1 GROUP BY 1, 2
             UNION ALL
             SELECT a.origem, a.chave, MIN(e.date)
               FROM (SELECT DISTINCT origem, chave FROM lancamentos_ajustes WHERE empresa_id = $1 AND origem = 'E' AND centro_id IN (SELECT id FROM ativos)) a
               JOIN sie_extrato_contas e ON e.id = a.chave AND e.empresa_id = $1 GROUP BY 1, 2) x
      GROUP BY 1`,
    [empresaId]
  );
  const porAno = new Map(rows.map((r) => [r.ano, r]));
  const ajustadosPorAno = new Map(ajustados.map((r) => [r.ano, r.n]));
  const { rows: criados } = await pool.query(
    'SELECT EXTRACT(YEAR FROM data)::int AS ano, COUNT(*)::int AS n FROM lancamentos_manuais WHERE empresa_id = $1 GROUP BY 1',
    [empresaId]
  );
  const criadosPorAno = new Map(criados.map((r) => [r.ano, r.n]));
  const lista = [];
  for (let ano = anoAtual; ano >= primeiroAno; ano -= 1) {
    const r = porAno.get(ano);
    lista.push({
      ano,
      receber: r?.receber || 0,
      pagar: r?.pagar || 0,
      movimentos: r?.movimentos || 0,
      ajustados: ajustadosPorAno.get(ano) || 0,
      criados: criadosPorAno.get(ano) || 0,
      travado: ano === anoAtual,
    });
  }
  return { primeiro_vencimento: primeiro, ano_atual: anoAtual, exercicios: lista };
}

// Lançamentos financeiros de um período (dentro do exercício). Primeiro uma linha por parcela ×
// centro de custo × natureza (`o`):
//   R  a receber (sie_income): valor líquido (original − impostos retidos), positivo, pela emissão;
//   P  a pagar (sie_outcome): valor original, negativo, pela emissão;
//   M  lançamento criado à mão (lancamentos_manuais, módulo lancamentos-manuais), pela data: entra como
//      movimento na tela, com o status CRIADO — entrada positiva, saída negativa;
//   E  movimento — extrato das contas sem título de contas a pagar/receber (bill_id nulo): o valor com
//      sinal da base do saldo de contas já rateada por centro e natureza (sie_extrato_contas_rateio,
//      montada a cada sincronização do extrato), pela data do lançamento. Fora só o que não tem
//      natureza — a "Inicialização CAIXA/BANCO", saldo de abertura, não movimento (mesma regra da
//      query do usuário).
// Todo tipo de documento entra (previsões, adiantamentos, inconsistentes…) e aparece na coluna, pra
// filtrar na tela.
// Rateio: o percentual de cada centro × natureza dividido pela soma dos percentuais da parcela — as
// linhas sempre somam o valor da parcela, mesmo se os percentuais não fecharem 100; parcela sem
// categoria entra inteira, sem centro/natureza. Categorias entram por LATERAL (índice
// idx_sie_*_categorias_parcela): com estatística desatualizada o Postgres errava os planos dos joins
// por empresa (ver dre-correcoes). Emissão pelos índices idx_sie_*_emissao.
// `chave` = o título (bill_id) ou, no movimento, o id do lançamento no extrato do Sienge (o registro_id
// é refeito a cada sincronização do extrato).
// $1 empresa, $2 primeiro dia do período, $3 dia seguinte ao último.
function sqlCategorias(tabela) {
  return `LEFT JOIN LATERAL (
      SELECT cost_center_id AS centro_id, MAX(cost_center_name) AS centro_nome,
             NULLIF(TRIM(financial_category_id), '') AS natureza_id, MAX(financial_category_name) AS natureza_nome,
             COALESCE(SUM(financial_category_rate) / NULLIF(SUM(SUM(financial_category_rate)) OVER (), 0),
                      1.0 / COUNT(*) OVER ()) AS peso
        FROM ${tabela} c
       WHERE c.bill_id = t.bill_id AND c.installment_id = t.installment_id AND c.empresa_id = t.empresa_id
       GROUP BY cost_center_id, NULLIF(TRIM(financial_category_id), '')
    ) c ON TRUE`;
}

const SQL_LINHAS = `
  SELECT 'R' AS origem, t.bill_id AS chave, t.issue_date AS data, t.due_date AS vencimento,
         t.installment_number::text AS parcela, NULLIF(TRIM(t.document_identification_id), '') AS documento,
         t.document_identification_name AS documento_nome, t.document_number AS numero, t.client_name AS contraparte,
         c.centro_id, c.centro_nome, c.natureza_id, c.natureza_nome,
         (t.original_amount - COALESCE(t.tax_amount, 0)) * COALESCE(c.peso, 1) AS valor
    FROM sie_income t
    ${sqlCategorias('sie_income_categorias')}
   WHERE t.empresa_id = $1 AND t.issue_date >= $2 AND t.issue_date < $3
  UNION ALL
  SELECT 'P', t.bill_id, t.issue_date, t.due_date, t.installment_id::text, NULLIF(TRIM(t.document_identification_id), ''),
         t.document_identification_name, t.document_number, t.creditor_name,
         c.centro_id, c.centro_nome, c.natureza_id, c.natureza_nome,
         -t.original_amount * COALESCE(c.peso, 1)
    FROM sie_outcome t
    ${sqlCategorias('sie_outcome_categorias')}
   WHERE t.empresa_id = $1 AND t.issue_date >= $2 AND t.issue_date < $3
  UNION ALL
  SELECT 'E', e.id, r.data, NULL, NULL, NULLIF(TRIM(e.document_id), ''), e.statement_type_notes, e.document_number,
         NULLIF(BTRIM(e.description, E' \\t\\r\\n'), ''), r.centro_id, NULL, r.natureza_id::text, NULL, r.valor
    FROM sie_extrato_contas_rateio r
    JOIN sie_extrato_contas e ON e.registro_id = r.registro_id
   WHERE r.empresa_id = $1 AND r.mes >= date_trunc('month', $2::date) AND r.mes < $3
     AND r.data >= $2 AND r.data < $3 AND e.bill_id IS NULL AND r.natureza_id IS NOT NULL
  UNION ALL
  SELECT 'M', m.id, m.data, NULL, NULL, NULLIF(TRIM(m.documento), ''), 'Lançamento criado', NULL, m.historico,
         m.centro_id, NULL, m.natureza_id, NULL, CASE WHEN m.tipo = 'SAIDA' THEN -m.valor ELSE m.valor END
    FROM lancamentos_manuais m
   WHERE m.empresa_id = $1 AND m.data >= $2 AND m.data < $3`;

// Uma linha por lançamento × centro × natureza (parcelas do título somadas — `g0`), com o ajuste da
// linha (lancamentos_ajustes, módulo lancamentos-ajustes) aplicado: centro, natureza e valor trocados,
// com o sinal da linha original; `centro_original`/`natureza_original` identificam a linha pra janela
// de ajuste. `percentual` = a linha sobre o total do lançamento (% do rateio, depois dos ajustes).
// Título/movimento: emissão (ou data) do lançamento inteiro. Só as linhas de centros com "Realiza
// DRE" (aba Centros Custos — pedido do usuário); o % do rateio continua sobre o lançamento inteiro
// (a fatia do título que cai naquele centro). Nomes de centro e natureza pelos cadastros (o extrato e
// o ajuste só trazem o id); o nome da categoria do título fica de reserva. Resultado: `lc`.
const CTE_LINHAS = `
  o AS MATERIALIZED (${SQL_LINHAS}),
  g0 AS (
    SELECT origem, chave, centro_id::bigint AS centro_id, natureza_id, MIN(data) AS data, MIN(vencimento) AS venc_min,
           MAX(vencimento) AS venc_max, COUNT(DISTINCT parcela)::int AS parcelas, MAX(documento) AS documento,
           MAX(documento_nome) AS documento_nome, MAX(numero) AS numero, MAX(contraparte) AS contraparte,
           MAX(centro_nome) AS centro_nome, MAX(natureza_nome) AS natureza_nome, SUM(valor) AS valor
      FROM o
     GROUP BY origem, chave, centro_id, natureza_id
  ),
  g AS (
    SELECT g0.origem, g0.chave, g0.data, g0.venc_min, g0.venc_max, g0.parcelas, g0.documento, g0.documento_nome, g0.numero,
           g0.contraparte, g0.centro_id AS centro_original, g0.natureza_id AS natureza_original,
           COALESCE(a.centro_id, g0.centro_id) AS centro_id, COALESCE(a.natureza_id, g0.natureza_id) AS natureza_id,
           CASE WHEN a.id IS NULL THEN g0.centro_nome END AS centro_nome_cat,
           CASE WHEN a.id IS NULL THEN g0.natureza_nome END AS natureza_nome_cat,
           CASE WHEN a.id IS NULL THEN g0.valor
                WHEN g0.valor < 0 OR (g0.valor = 0 AND g0.origem = 'P') THEN -a.valor ELSE a.valor END AS valor,
           CASE WHEN g0.origem = 'M' THEN 'CRIADO' WHEN a.id IS NULL THEN 'ORIGINAL' ELSE 'AJUSTADO' END AS status
      FROM g0
      LEFT JOIN lancamentos_ajustes a
        ON a.empresa_id = $1 AND a.origem = g0.origem AND a.chave = g0.chave
       AND a.centro_original IS NOT DISTINCT FROM g0.centro_id AND a.natureza_original IS NOT DISTINCT FROM g0.natureza_id
  ),
  gw AS (
    SELECT g.*, MIN(g.data) OVER w AS data_lanc, MIN(g.venc_min) OVER w AS venc_min_lanc, MAX(g.venc_max) OVER w AS venc_max_lanc,
           MAX(g.parcelas) OVER w AS parcelas_lanc, g.valor / NULLIF(SUM(g.valor) OVER w, 0) * 100 AS percentual
      FROM g
    WINDOW w AS (PARTITION BY g.origem, g.chave)
  ),
  lc AS (
    SELECT g.origem, g.chave, CASE WHEN g.origem IN ('R', 'P') THEN g.chave END AS titulo,
           g.data_lanc AS data, g.venc_min_lanc AS venc_min, g.venc_max_lanc AS venc_max, g.parcelas_lanc AS parcelas,
           g.documento, g.documento_nome, g.numero, g.contraparte,
           g.centro_original, g.natureza_original, g.centro_id, COALESCE(cc.name, g.centro_nome_cat) AS centro_nome,
           g.natureza_id, COALESCE(pf.name, g.natureza_nome_cat) AS natureza_nome, g.valor, g.percentual, g.status
      FROM gw g
      JOIN centros_custo_sienge cc ON cc.empresa_id = $1 AND cc.sienge_id = g.centro_id AND cc.realiza_dre
      LEFT JOIN planos_financeiros_sienge pf ON pf.empresa_id = $1 AND pf.sienge_id::text = g.natureza_id
  )`;

// 'AAAA-MM-DD' + 1 dia (fim exclusivo do período).
function diaSeguinte(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Período dentro do exercício: de/até (inclusive) presos ao ano; sem eles, o ano inteiro.
function periodo(ano, de, ate) {
  const ini = de && de.slice(0, 4) === String(ano) ? de : `${ano}-01-01`;
  const fim = ate && ate.slice(0, 4) === String(ano) ? ate : `${ano}-12-31`;
  return [ini, diaSeguinte(fim < ini ? ini : fim)];
}

// Filtros da tela (os de coluna da tabela): listas (vazio = todos). Centro, natureza e documento
// vazios no lançamento vêm como '' na lista. `titulos`: números de título (exatos); `contrapartes`:
// nomes de cliente/fornecedor; `meses`: 'AAAA-MM' da data (emissão; no movimento, a do extrato);
// `status`: 'ORIGINAL' / 'AJUSTADO'. `busca`: cliente/fornecedor/histórico, número, título, documento,
// centro ou natureza.
function montarFiltros({ origens, documentos, titulos, centros, naturezas, contrapartes, meses, status, busca }, params) {
  const cond = [];
  const lista = (coluna, valores) => {
    if (!valores?.length) return;
    params.push(valores.map(String));
    cond.push(`COALESCE(${coluna}, '') = ANY($${params.length}::text[])`);
  };
  // "Movimento" na tela (E) inclui os lançamentos criados à mão (M).
  lista('origem', origens?.includes('E') ? [...origens, 'M'] : origens);
  lista('documento', documentos);
  lista('titulo::text', titulos);
  lista('centro_id::text', centros);
  lista('natureza_id', naturezas);
  lista('contraparte', contrapartes);
  lista("to_char(data, 'YYYY-MM')", meses);
  lista('status', status);
  if (busca) {
    params.push(`%${busca}%`);
    const p = `$${params.length}`;
    cond.push(`(contraparte ILIKE ${p} OR numero ILIKE ${p} OR titulo::text ILIKE ${p} OR documento ILIKE ${p}
                OR documento_nome ILIKE ${p} OR centro_nome ILIKE ${p} OR natureza_nome ILIKE ${p} OR natureza_id ILIKE ${p})`);
  }
  return cond.length ? `WHERE ${cond.join(' AND ')}` : '';
}

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

// Uma página dos lançamentos (pela data, do mais antigo pro mais novo) e o total de linhas que passam
// nos filtros (a tela pede as páginas seguidas pra "mostrar todos"). Uma linha por título — as
// parcelas somadas —; título rateado sai uma linha por centro × natureza (pedido do usuário). No
// movimento, uma por lançamento do extrato (× centro × natureza). Com filtro de centro ou natureza, o
// lançamento rateado mostra só as linhas que passam.
async function lancamentos(empresaId, ano, filtros = {}, { pagina = 1, porPagina = 100 } = {}) {
  const params = [empresaId, ...periodo(ano, filtros.de, filtros.ate)];
  const where = montarFiltros(filtros, params);
  params.push(porPagina, (pagina - 1) * porPagina);
  const { rows } = await pool.query(
    `WITH ${CTE_LINHAS},
     f AS MATERIALIZED (SELECT * FROM lc ${where})
     SELECT (SELECT COUNT(*) FROM f) AS total,
            (SELECT COALESCE(json_agg(p), '[]'::json) FROM (
               SELECT origem, chave, titulo, to_char(data, 'YYYY-MM-DD') AS data, to_char(venc_min, 'YYYY-MM-DD') AS vencimento,
                      to_char(venc_max, 'YYYY-MM-DD') AS vencimento_ate, parcelas, documento, documento_nome, numero,
                      contraparte, centro_original, natureza_original, centro_id, centro_nome, natureza_id, natureza_nome,
                      ROUND(valor, 2) AS valor, ROUND(percentual, 2) AS percentual, status
                 FROM f
                ORDER BY data, origem DESC, chave, centro_original NULLS LAST, natureza_original NULLS LAST
                LIMIT $${params.length - 1} OFFSET $${params.length}) p) AS linhas`,
    params
  );
  return {
    ano,
    travado: ano === new Date().getFullYear(),
    pagina,
    por_pagina: porPagina,
    total: num(rows[0].total),
    linhas: rows[0].linhas.map((l) => ({ ...l, valor: num(l.valor), percentual: l.percentual === null ? null : num(l.percentual) })),
  };
}

// Opções dos filtros de coluna do exercício (o que existe nele, o ano inteiro): meses, tipos de
// documento, clientes/fornecedores (só dos títulos — no movimento a coluna é o histórico do extrato),
// naturezas e centros, com quantas linhas cada. O nome do documento do movimento (que só traz a sigla) vem dos títulos com a
// mesma sigla.
async function opcoesFiltros(empresaId, ano) {
  const { rows } = await pool.query(
    `WITH ${CTE_LINHAS},
     nomes AS (
       SELECT documento, MAX(documento_nome) AS nome FROM lc l WHERE origem IN ('R', 'P') AND documento IS NOT NULL GROUP BY 1
     )
     SELECT 'documento' AS tipo, COALESCE(l.documento, '') AS valor, MAX(n.nome) AS nome, COUNT(*)::int AS n
       FROM lc l LEFT JOIN nomes n ON n.documento = l.documento GROUP BY 2
     UNION ALL
     SELECT 'centro', COALESCE(centro_id::text, ''), MAX(centro_nome), COUNT(*)::int FROM lc l GROUP BY 2
     UNION ALL
     SELECT 'natureza', COALESCE(natureza_id, ''), MAX(natureza_nome), COUNT(*)::int FROM lc l GROUP BY 2
     UNION ALL
     SELECT 'mes', to_char(data, 'YYYY-MM'), NULL, COUNT(*)::int FROM lc l GROUP BY 2
     UNION ALL
     SELECT 'contraparte', contraparte, NULL, COUNT(*)::int FROM lc l WHERE origem IN ('R', 'P') AND contraparte IS NOT NULL GROUP BY 2`,
    [empresaId, ...periodo(ano)]
  );
  // Em ordem de código/nome (centro pelo número); o vazio ("sem …") por último.
  const ordem = (a, b) =>
    (a.valor === '') - (b.valor === '') || a.valor.localeCompare(b.valor, 'pt-BR', { numeric: true });
  const de = (tipo) =>
    rows
      .filter((r) => r.tipo === tipo)
      .map(({ valor, nome, n }) => ({ valor, nome, n }))
      .sort(ordem);
  return { meses: de('mes'), documentos: de('documento'), contrapartes: de('contraparte'), naturezas: de('natureza'), centros: de('centro') };
}

module.exports = { exercicios, lancamentos, opcoesFiltros };
