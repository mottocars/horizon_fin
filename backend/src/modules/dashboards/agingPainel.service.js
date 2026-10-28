const pool = require('../../config/db');
const saldosService = require('../saldo-contas-bancarias/saldos.service');
const { hojeEmBrasilia } = require('../extrato-contas-sienge/extratoContas-api.client');

// Dados do Aging List do dashboard Econômico Financeiro: todas as parcelas EM ABERTO (balance_amount > 0)
// do contas a receber (sie_income) e do contas a pagar (sie_outcome) da empresa, com o rateio por centro
// de custo × natureza, e o saldo bancário de hoje (Operações › Saldo Contas Bancárias). Faixas, filtros,
// agrupamentos e o simulador ficam no navegador (EconomicoFinanceiro/aging/modelo.js), que recalcula a
// cada clique — por isso vem tudo, sem filtro de centro, como no painel do Fluxo de Caixa.
// Valor de cada parcela: saldo CORRIGIDO (correctedBalanceAmount do Sienge — correção monetária e juros
// do contrato; sem ele, o saldo simples). `o` leva o saldo sem correção, para mostrar a diferença.
// Rateio (`f`): [[centro, natureza, fração]] — o percentual de cada linha dividido pela soma dos
// percentuais da parcela, para a soma das fatias bater com o saldo mesmo quando o Sienge manda 200%.

const LADOS = [
  {
    l: 'r',
    parcelas: 'sie_income',
    categorias: 'sie_income_categorias',
    pessoa: 'client',
    extras: `i.installment_number AS pc, i.main_unit AS u, i.payment_term_id AS cp, i.payment_term_description AS cp_nome,
             i.document_forecast = 'S' AS pv, i.defaulter_situation ILIKE 'inadimpl%' AS ina, i.sub_judicie = 'S' AS sj`,
  },
  {
    l: 'p',
    parcelas: 'sie_outcome',
    categorias: 'sie_outcome_categorias',
    pessoa: 'creditor',
    // Previsão financeira (de contrato de medição / pedido de compra): o documento real que a substitui
    // também fica no contas a pagar — a tela deixa escolher se entra (por padrão não entra, como no DFC).
    extras: `NULL AS pc, NULL AS u, NULL AS cp, NULL AS cp_nome,
             (i.forecast_document = 'S' OR COALESCE(i.document_identification_name, '') ILIKE '%PREVISÃO%') AS pv, FALSE AS ina, FALSE AS sj`,
  },
];

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

async function titulosDoLado(empresaId, t, dic) {
  const [{ rows }, { rows: cats }, { rows: base }] = await Promise.all([
    pool.query(
      `SELECT i.bill_id AS b, i.installment_id AS p, to_char(i.due_date, 'YYYY-MM-DD') AS v, to_char(i.issue_date, 'YYYY-MM-DD') AS e,
              COALESCE(i.corrected_balance_amount, i.balance_amount) AS s, i.balance_amount AS o, i.original_amount AS vo,
              i.company_id AS c, i.company_name AS c_nome, i.${t.pessoa}_id AS q, i.${t.pessoa}_name AS q_nome,
              i.document_identification_id AS d, i.document_identification_name AS d_nome, i.document_number AS n, ${t.extras}
         FROM ${t.parcelas} i
        WHERE i.empresa_id = $1 AND i.balance_amount > 0 AND i.due_date IS NOT NULL`,
      [empresaId]
    ),
    pool.query(
      `SELECT c.bill_id AS b, c.installment_id AS p, c.cost_center_id AS cc, c.cost_center_name AS cc_nome,
              c.financial_category_id AS nat, c.financial_category_name AS nat_nome, c.financial_category_rate AS pct
         FROM ${t.categorias} c
         JOIN ${t.parcelas} i ON i.empresa_id = c.empresa_id AND i.bill_id = c.bill_id AND i.installment_id = c.installment_id
        WHERE c.empresa_id = $1 AND i.balance_amount > 0 AND i.due_date IS NOT NULL`,
      [empresaId]
    ),
    pool.query(`SELECT max(atualizado_em) AS atualizado_em FROM ${t.parcelas} WHERE empresa_id = $1`, [empresaId]),
  ]);

  const rateio = new Map();
  cats.forEach((c) => {
    const k = `${c.b}|${c.p}`;
    if (!rateio.has(k)) rateio.set(k, []);
    rateio.get(k).push(c);
    if (c.cc !== null && !dic.centrosSienge[c.cc]) dic.centrosSienge[c.cc] = c.cc_nome;
    if (c.nat !== null && !dic.naturezas[c.nat]) dic.naturezas[c.nat] = c.nat_nome;
  });

  const titulos = rows.map((r) => {
    if (r.c !== null && !dic.empresas[r.c]) dic.empresas[r.c] = r.c_nome;
    if (r.q !== null && !dic.pessoas[t.l][r.q]) dic.pessoas[t.l][r.q] = r.q_nome;
    r.d = r.d === null ? null : r.d.trim(); // o Sienge manda o código com espaços ("CT  ")
    if (r.d !== null && !dic.documentos[r.d]) dic.documentos[r.d] = r.d_nome;
    if (r.cp !== null && !dic.condicoes[r.cp]) dic.condicoes[r.cp] = r.cp_nome;
    const linhas = rateio.get(`${r.b}|${r.p}`) || [];
    const totalPct = linhas.reduce((s, c) => s + num(c.pct), 0);
    const f = linhas.length
      ? linhas.map((c) => [c.cc === null ? null : Number(c.cc), c.nat, totalPct > 0 ? Math.round((num(c.pct) / totalPct) * 1e6) / 1e6 : 1 / linhas.length])
      : [[null, null, 1]];
    const tit = {
      l: t.l,
      b: Number(r.b),
      p: Number(r.p),
      v: r.v,
      e: r.e,
      s: num(r.s),
      o: num(r.o),
      vo: num(r.vo),
      c: r.c === null ? null : Number(r.c),
      q: r.q === null ? null : Number(r.q),
      d: r.d,
      n: r.n,
      f,
    };
    // Só o que existe — o a receber tem parcela/unidade/condição; flags só quando verdadeiras.
    if (r.pc) tit.pc = r.pc;
    if (r.u) tit.u = r.u;
    if (r.cp) tit.cp = r.cp;
    if (r.pv) tit.pv = 1;
    if (r.ina) tit.ina = 1;
    if (r.sj) tit.sj = 1;
    return tit;
  });
  return { titulos, atualizado_em: base[0]?.atualizado_em || null };
}

// Saldo bancário de hoje, como na tela Saldo Contas Bancárias: o último dia com saldo lançado (até
// hoje), conta a conta, só as contas que a tela mostra (classificadas e com "Projeta saldo"). `libera`:
// classificação de saldo liberado (true), bloqueado (false) ou não informado (null); `bloqueio`: bloqueio
// registrado no dia; `limite`: cheque especial da conta — como na tela, só no dia com abertura de
// período. Quem é caixa livre, bloqueado ou crédito é decidido no navegador (aging/modelo.js::caixa).
async function saldoBancario(empresaId, hoje) {
  const { rows } = await pool.query(
    `SELECT to_char(max(data), 'YYYY-MM-DD') AS data FROM saldos_contas_bancarias WHERE empresa_id = $1 AND data <= $2::date`,
    [empresaId, hoje]
  );
  const data = rows[0]?.data;
  if (!data) return { data: null, contas: [] };
  const { contas, periodos } = await saldosService.getSaldos(empresaId, { dataInicio: data, dataFim: data });
  const comPeriodo = periodos.includes(data);
  return {
    data,
    contas: contas
      .filter((c) => c.saldos[data] !== undefined && c.saldos[data] !== null)
      .map((c) => ({
        company_id: c.company_id,
        empresa: c.company_name,
        conta: c.numero_conta,
        nome: c.nome || c.numero_conta,
        classificacao: c.classificacao,
        libera: c.classificacao_libera_saldo,
        saldo: Number(c.saldos[data]),
        bloqueio: Number(c.bloqueios?.[data] || 0),
        limite: comPeriodo && c.valor_cheque_especial > 0 ? Number(c.valor_cheque_especial) : 0,
      })),
  };
}

async function painel(empresaId) {
  const hoje = hojeEmBrasilia();
  const dic = { empresas: {}, centrosSienge: {}, naturezas: {}, pessoas: { r: {}, p: {} }, documentos: {}, condicoes: {} };
  const [receber, pagar, bancos, centrosRows, empresa] = await Promise.all([
    titulosDoLado(empresaId, LADOS[0], dic),
    titulosDoLado(empresaId, LADOS[1], dic),
    saldoBancario(empresaId, hoje),
    pool.query(`SELECT sienge_id AS id, name AS nome, company_id, company_name FROM centros_custo_sienge WHERE empresa_id = $1`, [empresaId]),
    pool.query(`SELECT COALESCE(NULLIF(nome_fantasia, ''), razao_social) AS nome FROM empresas WHERE id = $1`, [empresaId]),
  ]);

  // Centros: os do cadastro que têm parcela em aberto; os que só existem no rateio entram com o nome dele.
  const usados = new Set([...receber.titulos, ...pagar.titulos].flatMap((t) => t.f.map((x) => x[0])).filter((x) => x !== null));
  const cadastro = new Map(centrosRows.rows.map((c) => [Number(c.id), c]));
  const centros = [...usados].map((id) => {
    const c = cadastro.get(id);
    return c
      ? { id, nome: c.nome, company_id: c.company_id, company_name: c.company_name }
      : { id, nome: dic.centrosSienge[id] || `Centro ${id}`, company_id: null, company_name: null };
  });

  return {
    hoje,
    empresa: empresa.rows[0]?.nome || null,
    bases: { r: receber.atualizado_em, p: pagar.atualizado_em },
    centros,
    empresas: dic.empresas,
    naturezas: dic.naturezas,
    pessoas: dic.pessoas,
    documentos: dic.documentos,
    condicoes: dic.condicoes,
    titulos: [...receber.titulos, ...pagar.titulos],
    bancos,
  };
}

module.exports = { painel };
