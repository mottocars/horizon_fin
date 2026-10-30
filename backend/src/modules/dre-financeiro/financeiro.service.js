const pool = require('../../config/db');

// Operações > DRE Gerencial > Financeiro: os exercícios (anos) da empresa, do ano do primeiro
// lançamento financeiro até o ano atual. O primeiro ano sai do menor VENCIMENTO do contas a receber
// (sie_income) e a pagar (sie_outcome): a emissão tem datas digitadas erradas no Sienge (títulos da
// TOSTE E DINIZ emitidos em "2002" que vencem em 2026) e jogaria o primeiro exercício décadas pra
// trás. Dentro do exercício, porém, os títulos entram pela EMISSÃO (pedido do usuário) — a contagem
// de cada card e a listagem (lancamentos) são por emissão; título emitido antes do primeiro
// exercício não aparece em nenhum.
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
    `SELECT EXTRACT(YEAR FROM issue_date)::int AS ano,
            COUNT(*) FILTER (WHERE tipo = 'R')::int AS receber,
            COUNT(*) FILTER (WHERE tipo = 'P')::int AS pagar
       FROM (SELECT 'R' AS tipo, issue_date FROM sie_income WHERE empresa_id = $1 AND issue_date >= $2 AND issue_date < $3
             UNION ALL
             SELECT 'P', issue_date FROM sie_outcome WHERE empresa_id = $1 AND issue_date >= $2 AND issue_date < $3) t
      GROUP BY 1`,
    [empresaId, `${primeiroAno}-01-01`, `${anoAtual + 1}-01-01`]
  );
  const porAno = new Map(rows.map((r) => [r.ano, r]));
  const lista = [];
  for (let ano = anoAtual; ano >= primeiroAno; ano -= 1) {
    const r = porAno.get(ano);
    lista.push({ ano, receber: r?.receber || 0, pagar: r?.pagar || 0, travado: ano === anoAtual });
  }
  return { primeiro_vencimento: primeiro, ano_atual: anoAtual, exercicios: lista };
}

// Lançamentos financeiros de um período (dentro do exercício) — uma linha por parcela × centro de
// custo × natureza:
//   R  a receber (sie_income): valor líquido (original − impostos retidos), positivo, pela emissão;
//   P  a pagar (sie_outcome): valor original, negativo, pela emissão;
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
  SELECT 'R' AS origem, t.issue_date AS data, t.due_date AS vencimento, t.bill_id AS titulo,
         t.installment_number::text AS parcela, NULLIF(TRIM(t.document_identification_id), '') AS documento,
         t.document_identification_name AS documento_nome, t.document_number AS numero, t.client_name AS contraparte,
         c.centro_id, c.centro_nome, c.natureza_id, c.natureza_nome,
         (t.original_amount - COALESCE(t.tax_amount, 0)) * COALESCE(c.peso, 1) AS valor
    FROM sie_income t
    ${sqlCategorias('sie_income_categorias')}
   WHERE t.empresa_id = $1 AND t.issue_date >= $2 AND t.issue_date < $3
  UNION ALL
  SELECT 'P', t.issue_date, t.due_date, t.bill_id, t.installment_id::text, NULLIF(TRIM(t.document_identification_id), ''),
         t.document_identification_name, t.document_number, t.creditor_name,
         c.centro_id, c.centro_nome, c.natureza_id, c.natureza_nome,
         -t.original_amount * COALESCE(c.peso, 1)
    FROM sie_outcome t
    ${sqlCategorias('sie_outcome_categorias')}
   WHERE t.empresa_id = $1 AND t.issue_date >= $2 AND t.issue_date < $3
  UNION ALL
  SELECT 'E', r.data, NULL, NULL, NULL, NULLIF(TRIM(e.document_id), ''), e.statement_type_notes, e.document_number,
         NULLIF(BTRIM(e.description, E' \\t\\r\\n'), ''), r.centro_id, NULL, r.natureza_id::text, NULL, r.valor
    FROM sie_extrato_contas_rateio r
    JOIN sie_extrato_contas e ON e.registro_id = r.registro_id
   WHERE r.empresa_id = $1 AND r.mes >= date_trunc('month', $2::date) AND r.mes < $3
     AND r.data >= $2 AND r.data < $3 AND e.bill_id IS NULL AND r.natureza_id IS NOT NULL`;

// Nomes de centro e natureza pelos cadastros (o extrato só traz o id); o nome da categoria do título
// fica de reserva.
const SQL_COMPLETO = `
  SELECT l.origem, l.data, l.vencimento, l.titulo, l.parcela, l.documento, l.documento_nome, l.numero, l.contraparte,
         l.centro_id, COALESCE(cc.name, l.centro_nome) AS centro_nome,
         l.natureza_id, COALESCE(pf.name, l.natureza_nome) AS natureza_nome, l.valor
    FROM (${SQL_LINHAS}) l
    LEFT JOIN centros_custo_sienge cc ON cc.empresa_id = $1 AND cc.sienge_id = l.centro_id
    LEFT JOIN planos_financeiros_sienge pf ON pf.empresa_id = $1 AND pf.sienge_id::text = l.natureza_id`;

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
// vazios no lançamento vêm como '' na lista. `contrapartes`: nomes de cliente/fornecedor; `meses`:
// 'AAAA-MM' da data (emissão; no movimento, a do extrato). `busca`: cliente/fornecedor/histórico,
// número, título, documento, centro ou natureza.
function montarFiltros({ origens, documentos, centros, naturezas, contrapartes, meses, busca }, params) {
  const cond = [];
  const lista = (coluna, valores) => {
    if (!valores?.length) return;
    params.push(valores.map(String));
    cond.push(`COALESCE(${coluna}, '') = ANY($${params.length}::text[])`);
  };
  lista('origem', origens);
  lista('documento', documentos);
  lista('centro_id::text', centros);
  lista('natureza_id', naturezas);
  lista('contraparte', contrapartes);
  lista("to_char(data, 'YYYY-MM')", meses);
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
// nos filtros (a tela pede as páginas seguidas pra "mostrar todos").
async function lancamentos(empresaId, ano, filtros = {}, { pagina = 1, porPagina = 100 } = {}) {
  const params = [empresaId, ...periodo(ano, filtros.de, filtros.ate)];
  const where = montarFiltros(filtros, params);
  params.push(porPagina, (pagina - 1) * porPagina);
  const { rows } = await pool.query(
    `WITH f AS MATERIALIZED (SELECT * FROM (${SQL_COMPLETO}) x ${where})
     SELECT (SELECT COUNT(*) FROM f) AS total,
            (SELECT COALESCE(json_agg(p), '[]'::json) FROM (
               SELECT origem, to_char(data, 'YYYY-MM-DD') AS data, to_char(vencimento, 'YYYY-MM-DD') AS vencimento, titulo,
                      parcela, documento, documento_nome, numero, contraparte, centro_id, centro_nome, natureza_id, natureza_nome,
                      ROUND(valor, 2) AS valor
                 FROM f
                ORDER BY data, origem DESC, titulo NULLS LAST, CASE WHEN parcela ~ '^[0-9]+$' THEN parcela::bigint END, parcela,
                         centro_id NULLS LAST, natureza_id NULLS LAST, valor
                LIMIT $${params.length - 1} OFFSET $${params.length}) p) AS linhas`,
    params
  );
  return {
    ano,
    travado: ano === new Date().getFullYear(),
    pagina,
    por_pagina: porPagina,
    total: num(rows[0].total),
    linhas: rows[0].linhas.map((l) => ({ ...l, valor: num(l.valor) })),
  };
}

// Opções dos filtros de coluna do exercício (o que existe nele, o ano inteiro): meses, tipos de
// documento, clientes/fornecedores (só dos títulos — no movimento a coluna é o histórico do extrato),
// naturezas e centros, com quantas linhas cada. O nome do documento do movimento (que só traz a sigla) vem dos títulos com a
// mesma sigla.
async function opcoesFiltros(empresaId, ano) {
  const { rows } = await pool.query(
    `WITH l AS MATERIALIZED (${SQL_COMPLETO}),
     nomes AS (
       SELECT documento, MAX(documento_nome) AS nome FROM l WHERE origem <> 'E' AND documento IS NOT NULL GROUP BY 1
     )
     SELECT 'documento' AS tipo, COALESCE(l.documento, '') AS valor, MAX(n.nome) AS nome, COUNT(*)::int AS n
       FROM l LEFT JOIN nomes n ON n.documento = l.documento GROUP BY 2
     UNION ALL
     SELECT 'centro', COALESCE(centro_id::text, ''), MAX(centro_nome), COUNT(*)::int FROM l GROUP BY 2
     UNION ALL
     SELECT 'natureza', COALESCE(natureza_id, ''), MAX(natureza_nome), COUNT(*)::int FROM l GROUP BY 2
     UNION ALL
     SELECT 'mes', to_char(data, 'YYYY-MM'), NULL, COUNT(*)::int FROM l GROUP BY 2
     UNION ALL
     SELECT 'contraparte', contraparte, NULL, COUNT(*)::int FROM l WHERE origem <> 'E' AND contraparte IS NOT NULL GROUP BY 2`,
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
