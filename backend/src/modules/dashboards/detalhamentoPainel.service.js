const pool = require('../../config/db');
const fluxo = require('../dfc-fluxo/fluxo.service');
const { LADOS, titulosDoLado } = require('./agingPainel.service');
const { hojeEmBrasilia } = require('../extrato-contas-sienge/extratoContas-api.client');

// Dados do Detalhamento Financeiro do dashboard Econômico Financeiro, no período Início–Fim:
// - REALIZADO: cada lançamento do extrato bancário do Sienge (sie_extrato_contas, rotina "Saldos das contas
//   (Sienge)") das contas com "Projeta DFC" (DFC Construtoras › Contas Correntes), com a data no período, no
//   MESMO rateio do realizado do DFC (sie_extrato_contas_rateio): títulos pagos e recebidos e também tarifas
//   e demais lançamentos sem título. Com título (bill_id — origem CR = contas a receber, CP = contas a
//   pagar), ele vem com o cliente/fornecedor e o vencimento da parcela.
// - EM ABERTO: as parcelas do Aging List (agingPainel::titulosDoLado — saldo corrigido, mesmo rateio) que
//   vencem no período, com as previsões financeiras marcadas (pv) — a tela as deixa de fora por padrão (como o Aging e o DFC fazem por padrão).
// Cada fatia leva a Máscara DFC nível 2 (fluxo.service::classificador, a mesma da aba DFC; null = sem
// máscara) — o navegador (EconomicoFinanceiro/detalhamento/modelo.js) tira a movimentação entre contas e
// monta o resumo, o gráfico, o Sankey e o detalhamento.

const CONTAS_DFC = (alias) =>
  `JOIN contas_bancarias_sienge c ON c.empresa_id = ${alias}.empresa_id AND c.company_id = ${alias}.company_id
        AND c.numero_conta = ${alias}.numero_conta AND c.projeta_dfc`;

const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const limpo = (s) =>
  String(s || '')
    .replace(/\s+/g, ' ')
    .trim();

// Pessoa e vencimento das parcelas dos lançamentos de uma origem (a parcela que saiu da base fica com os
// dados de outra parcela do mesmo título).
const TITULOS = { CR: { tabela: 'sie_income', pessoa: 'client' }, CP: { tabela: 'sie_outcome', pessoa: 'creditor' } };
async function titulosRealizados(empresaId, origem, de, ate) {
  const t = TITULOS[origem];
  const { rows } = await pool.query(
    `WITH x AS (
       SELECT DISTINCT e.bill_id, e.installment_number FROM sie_extrato_contas e ${CONTAS_DFC('e')}
        WHERE e.empresa_id = $1 AND e.date BETWEEN $2::date AND $3::date AND e.statement_origin = '${origem}' AND e.bill_id IS NOT NULL
     )
     SELECT x.bill_id AS b, x.installment_number AS p, i.due_date AS vc,
            COALESCE(i.${t.pessoa}_id, f.${t.pessoa}_id) AS q, COALESCE(i.${t.pessoa}_name, f.${t.pessoa}_name) AS q_nome
       FROM x
       LEFT JOIN ${t.tabela} i ON i.empresa_id = $1 AND i.bill_id = x.bill_id AND i.installment_id = x.installment_number
       LEFT JOIN LATERAL (
              SELECT ${t.pessoa}_id, ${t.pessoa}_name FROM ${t.tabela} WHERE empresa_id = $1 AND bill_id = x.bill_id LIMIT 1
            ) f ON i.bill_id IS NULL`,
    [empresaId, de, ate]
  );
  return rows;
}

// `de` / `ate`: 'AAAA-MM-DD' — data do lançamento (realizado) e vencimento da parcela (em aberto).
async function painel(empresaId, { de, ate }) {
  const hoje = hojeEmBrasilia();
  const dic = { empresas: {}, centrosSienge: {}, naturezas: {}, pessoas: { r: {}, p: {} }, documentos: {}, condicoes: {} };
  const [cls, { rows: contasRows }, { rows: linhas }, { rows: partes }, trR, trP, abR, abP, centrosRows, empresa] = await Promise.all([
    fluxo.classificador(empresaId),
    pool.query(
      `SELECT c.company_id, c.numero_conta, c.nome, c.company_name, c.banco_nome, s.data_ate
         FROM contas_bancarias_sienge c
         LEFT JOIN sie_extrato_contas_sincronizacoes s
           ON s.empresa_id = c.empresa_id AND s.company_id = c.company_id AND s.numero_conta = c.numero_conta
        WHERE c.empresa_id = $1 AND c.projeta_dfc
        ORDER BY c.company_name NULLS LAST, c.numero_conta`,
      [empresaId]
    ),
    pool.query(
      `SELECT e.registro_id AS i, e.date AS d, e.company_id, e.numero_conta, e.statement_origin AS o, e.statement_type AS st, e.type AS ty,
              e.bill_id AS b, e.installment_number AS p, NULLIF(trim(e.document_id), '') AS doc,
              NULLIF(trim(e.document_number), '') AS n, e.description AS ds
         FROM sie_extrato_contas e ${CONTAS_DFC('e')}
        WHERE e.empresa_id = $1 AND e.date BETWEEN $2::date AND $3::date
        ORDER BY e.date, e.registro_id`,
      [empresaId, de, ate]
    ),
    pool.query(
      `SELECT r.registro_id AS i, r.centro_id AS c, r.natureza_id AS nat, r.valor AS v
         FROM sie_extrato_contas_rateio r ${CONTAS_DFC('r')}
        WHERE r.empresa_id = $1 AND r.mes BETWEEN date_trunc('month', $2::date) AND $3::date AND r.data BETWEEN $2::date AND $3::date
        ORDER BY r.id`,
      [empresaId, de, ate]
    ),
    titulosRealizados(empresaId, 'CR', de, ate),
    titulosRealizados(empresaId, 'CP', de, ate),
    titulosDoLado(empresaId, LADOS[0], dic),
    titulosDoLado(empresaId, LADOS[1], dic),
    pool.query(`SELECT sienge_id AS id, name AS nome, company_id, company_name FROM centros_custo_sienge WHERE empresa_id = $1`, [empresaId]),
    pool.query(`SELECT COALESCE(NULLIF(nome_fantasia, ''), razao_social) AS nome FROM empresas WHERE id = $1`, [empresaId]),
  ]);

  const usadosCentro = new Set();
  const usadosPlano = new Set();
  const classe = (c, nat) => {
    if (c !== null) usadosCentro.add(c);
    if (nat !== null) usadosPlano.add(nat);
    return cls.classificar(c, nat)?.n2 ?? null;
  };

  const contas = contasRows.map((c) => ({ id: `${c.company_id}|${c.numero_conta}`, empresa: c.company_name, numero: c.numero_conta, nome: limpo(c.nome) || c.numero_conta, banco: c.banco_nome }));
  const idxConta = new Map(contasRows.map((c, i) => [`${c.company_id}|${c.numero_conta}`, i]));

  // Pessoas: o nome como vem no título (do realizado e do em aberto).
  const pessoas = dic.pessoas;
  const parcela = new Map();
  [
    ['CR', 'r', trR],
    ['CP', 'p', trP],
  ].forEach(([o, l, rows]) =>
    rows.forEach((r) => {
      const q = r.q === null ? null : Number(r.q);
      if (q !== null && !pessoas[l][q] && r.q_nome) pessoas[l][q] = limpo(r.q_nome);
      parcela.set(`${o}|${r.b}|${r.p}`, { q, vc: r.vc || null });
    })
  );

  // Realizado: fatias do rateio [centro, natureza, valor com sinal, máscara 2].
  const fatias = new Map();
  partes.forEach((r) => {
    const c = r.c === null ? null : Number(r.c);
    const nat = r.nat === null ? null : Number(r.nat);
    if (!fatias.has(r.i)) fatias.set(r.i, []);
    fatias.get(r.i).push([c, nat, num(r.v), classe(c, nat)]);
  });
  const lancamentos = [];
  linhas.forEach((r) => {
    const f = fatias.get(r.i);
    if (!f) return; // sem rateio não entra (o DFC também só soma o rateio)
    const L = { i: r.i, d: r.d, k: idxConta.get(`${r.company_id}|${r.numero_conta}`), o: r.o || '?', f };
    if (r.b !== null) {
      L.b = Number(r.b);
      if (r.p !== null) L.p = Number(r.p);
      const t = parcela.get(`${r.o}|${r.b}|${r.p}`);
      if (t?.q !== null && t?.q !== undefined) L.q = t.q;
      if (t?.vc) L.vc = t.vc;
    }
    if (r.ty) L.ty = r.ty; // Income / Expense: define se é entrada ou saída
    if (r.doc) L.doc = r.doc;
    if (r.n) L.n = r.n;
    // Descrição só quando diz algo além do nome da pessoa (nos títulos costuma ser o próprio nome).
    const ds = limpo(r.ds);
    const nomeQ = L.q !== undefined ? pessoas[r.o === 'CR' ? 'r' : 'p'][L.q] : null;
    if (ds && (!nomeQ || ds.toUpperCase() !== nomeQ.toUpperCase())) L.ds = ds.slice(0, 200);
    if (/inicializa/i.test(r.st || '')) L.ini = 1; // inicialização de saldo: não é entrada nem saída
    lancamentos.push(L);
  });

  // Em aberto: parcelas do Aging que vencem no período, com as previsões financeiras marcadas (pv) — a tela as deixa de fora por padrão.
  const abertos = [];
  [abR, abP].forEach(({ titulos }) =>
    titulos.forEach((t) => {
      if (t.v < de || t.v > ate) return;
      const natNum = (nat) => (nat === null || nat === undefined || !Number.isFinite(Number(nat)) ? null : Number(nat));
      const T = { l: t.l, b: t.b, p: t.p, v: t.v, s: t.s, f: t.f.map(([c, nat, frac]) => [c, natNum(nat), frac, classe(c, natNum(nat))]) };
      if (t.q !== null) T.q = t.q;
      if (t.pv) T.pv = 1; // previsão financeira — o filtro da tela decide se entra (padrão: fora)
      if (t.d) T.doc = t.d;
      if (t.n) T.n = t.n;
      if (t.u) T.u = t.u;
      if (t.pc) T.pc = t.pc;
      abertos.push(T);
    })
  );

  const cadastro = new Map(centrosRows.rows.map((c) => [Number(c.id), c]));
  const centros = [...usadosCentro].map((id) => {
    const c = cadastro.get(id);
    return c ? { id, nome: c.nome, company_id: c.company_id } : { id, nome: dic.centrosSienge[id] || `Centro ${id}`, company_id: null };
  });
  const planos = {};
  usadosPlano.forEach((id) => {
    const c = cls.conta(id);
    planos[id] = [c.codigo, limpo(c.name) || limpo(dic.naturezas[id])];
  });
  const datas = contasRows.map((c) => c.data_ate).filter(Boolean).sort();

  return {
    hoje,
    empresa: empresa.rows[0]?.nome || null,
    periodo: { de, ate },
    extrato_ate: datas[0] || null, // o realizado vai até onde o extrato foi buscado (a conta mais atrasada manda)
    contas,
    mascaras: cls.mascaras.map((g) => ({ id: g.id, descricao: g.descricao, filhos: g.filhos.map((f) => ({ id: f.id, descricao: f.descricao })) })),
    planos,
    centros,
    pessoas,
    documentos: dic.documentos,
    lancamentos,
    abertos,
  };
}

module.exports = { painel };
