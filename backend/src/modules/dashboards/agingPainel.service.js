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
    if (r.q !== null && !dic.pessoas[t.l][r.q]) dic.pessoas[t.l][r.q] = r.q_nome ? r.q_nome.trim() : r.q_nome;
    r.d = r.d === null ? null : r.d.trim(); // o Sienge manda o código com espaços ("CT  ")
    if (r.d !== null && !dic.documentos[r.d]) dic.documentos[r.d] = r.d_nome;
    // Nome da condição como vem do Sienge tem espaços sobrando ("CEF  FINANCIAMENTO ").
    if (r.cp !== null && !dic.condicoes[r.cp]) dic.condicoes[r.cp] = r.cp_nome ? r.cp_nome.replace(/\s+/g, ' ').trim() : r.cp_nome;
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
    // Conta com cheque especial e saldo em branco entra com saldo zero (só o limite), como no
    // Liberado + cheque da tela Saldo (resumoSaldos.calculo.js).
    contas: contas
      .filter((c) => (c.saldos[data] !== undefined && c.saldos[data] !== null) || (comPeriodo && c.valor_cheque_especial > 0))
      .map((c) => ({
        company_id: c.company_id,
        empresa: c.company_name,
        conta: c.numero_conta,
        nome: c.nome || c.numero_conta,
        classificacao: c.classificacao,
        libera: c.classificacao_libera_saldo,
        saldo: Number(c.saldos[data] ?? 0),
        bloqueio: Number(c.bloqueios?.[data] || 0),
        limite: comPeriodo && c.valor_cheque_especial > 0 ? Number(c.valor_cheque_especial) : 0,
      })),
  };
}

// Listas completas para o painel de filtros — tudo o que existe, tenha ou não parcela em aberto no
// período: as contas de resultado do plano de contas (Cadastros › Plano de Contas; as totalizadoras,
// tp_conta T, ficam de fora — pedido do usuário), os tipos de documento de qualquer título (pago ou em aberto; o Sienge não tem um
// cadastro deles aqui), os clientes (cadastro do Sienge + quem já teve título a receber) e os
// fornecedores (credores já consultados no Sienge + quem já teve título a pagar).
async function catalogos(empresaId) {
  const [planos, documentos, clientes, fornecedores] = await Promise.all([
    pool.query(
      `SELECT sienge_id::text AS id, name AS nome, fl_ativa AS ativa
         FROM planos_financeiros_sienge WHERE empresa_id = $1 AND tp_conta IS DISTINCT FROM 'T' ORDER BY sienge_id::text`,
      [empresaId]
    ),
    pool.query(
      `SELECT DISTINCT ON (id) id, nome FROM (
         SELECT trim(document_identification_id) AS id, document_identification_name AS nome FROM sie_income WHERE empresa_id = $1
         UNION SELECT trim(document_identification_id), document_identification_name FROM sie_outcome WHERE empresa_id = $1
       ) d WHERE id IS NOT NULL AND id <> '' ORDER BY id, nome`,
      [empresaId]
    ),
    pool.query(
      `SELECT id, nome FROM (
         SELECT id, COALESCE(NULLIF(name, ''), social_name) AS nome, 1 AS ordem FROM sie_customers WHERE empresa_id = $1
         UNION ALL SELECT DISTINCT client_id, client_name, 2 FROM sie_income WHERE empresa_id = $1 AND client_id IS NOT NULL
       ) c ORDER BY ordem`,
      [empresaId]
    ),
    pool.query(
      `SELECT id, nome FROM (
         SELECT c.credor_id AS id, c.nome, 1 AS ordem
           FROM sienge_credores_cache c JOIN integracoes_sienge i ON i.tenant = c.tenant AND i.empresa_id = $1
         UNION ALL SELECT DISTINCT creditor_id, creditor_name, 2 FROM sie_outcome WHERE empresa_id = $1 AND creditor_id IS NOT NULL
       ) f ORDER BY ordem`,
      [empresaId]
    ),
  ]);
  // Um nome por código: o do cadastro, se houver (vem primeiro); senão o do título. Sem os espaços da
  // ponta (há nomes no Sienge que começam com espaço e furavam a ordem alfabética da lista).
  const porId = (rows) => {
    const m = {};
    rows.forEach((r) => {
      const nome = r.nome?.trim();
      if (r.id !== null && !m[r.id] && nome) m[r.id] = nome;
    });
    return m;
  };
  return {
    planos: planos.rows,
    documentos: porId(documentos.rows),
    clientes: porId(clientes.rows),
    fornecedores: porId(fornecedores.rows),
  };
}

async function painel(empresaId) {
  const hoje = hojeEmBrasilia();
  const dic = { empresas: {}, centrosSienge: {}, naturezas: {}, pessoas: { r: {}, p: {} }, documentos: {}, condicoes: {} };
  const [receber, pagar, bancos, listas, centrosRows, empresa] = await Promise.all([
    titulosDoLado(empresaId, LADOS[0], dic),
    titulosDoLado(empresaId, LADOS[1], dic),
    saldoBancario(empresaId, hoje),
    catalogos(empresaId),
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
    catalogos: listas,
    manuais: await titulosManuais(empresaId),
  };
}

// Títulos manuais do Horizon (Cadastros › Contas Pagar / Receber) que ainda não foram quitados, para o simulador
// de caixa do Aging (opção "Considera Títulos Manuais do Horizon"). Cada item: lado (r/p), data, valor e rateio
// [centro, natureza, fração] — os filtros de centro e plano de contas da tela valem.
// - Financeiro: cada parcela sem baixa, na data de vencimento informada.
// - Projeção PLS CEF (pedido do usuário): não cai na emissão — Novo Registro + Medição entram na Data Previsão
//   Recebimento PF e o Crédito PJ na Data Previsão Recebimento PJ, com os valores e contas guardados no título
//   (`dados`); some quando o título é quitado (todas as parcelas baixadas).
async function titulosManuais(empresaId) {
  const conv = (rateio) =>
    (rateio && rateio.length ? rateio : [[null, null, 1]]).map(([c, n, fr]) => [c === null ? null : Number(c), n === null ? null : String(n), Number(fr)]);
  const [{ rows: financeiro }, { rows: pls }] = await Promise.all([
    pool.query(
      `SELECT p.id, p.numero, p.vencimento, p.valor, t.id AS titulo_id, t.tipo, t.tipo_documento, t.pessoa_nome,
              (SELECT count(*)::int FROM cpr_parcelas x WHERE x.titulo_id = t.id) AS total_parcelas,
              (SELECT COALESCE(json_agg(json_build_array(r.centro_id, r.natureza_id, r.percentual / 100.0) ORDER BY r.id), '[]'::json)
                 FROM cpr_rateios r WHERE r.titulo_id = t.id) AS rateio
         FROM cpr_parcelas p JOIN cpr_titulos t ON t.id = p.titulo_id
        WHERE t.empresa_id = $1 AND p.data_baixa IS NULL AND t.tipo_documento <> 'PROJECAO_PLS_CEF'
        ORDER BY p.vencimento, t.id, p.numero`,
      [empresaId]
    ),
    pool.query(
      `SELECT t.id AS titulo_id, t.tipo, t.pessoa_nome, t.dados,
              (SELECT COALESCE(json_agg(json_build_array(r.centro_id, r.natureza_id, r.percentual / 100.0) ORDER BY r.id), '[]'::json)
                 FROM cpr_rateios r WHERE r.titulo_id = t.id) AS rateio,
              (SELECT json_agg(json_build_object('id', p.id, 'numero', p.numero, 'vencimento', p.vencimento, 'valor', p.valor) ORDER BY p.numero)
                 FROM cpr_parcelas p WHERE p.titulo_id = t.id AND p.data_baixa IS NULL) AS abertas,
              (SELECT count(*)::int FROM cpr_parcelas p WHERE p.titulo_id = t.id) AS total_parcelas
         FROM cpr_titulos t
        WHERE t.empresa_id = $1 AND t.tipo_documento = 'PROJECAO_PLS_CEF'
          AND EXISTS (SELECT 1 FROM cpr_parcelas p WHERE p.titulo_id = t.id AND p.data_baixa IS NULL)`,
      [empresaId]
    ),
  ]);

  const itens = financeiro.map((r) => ({
    id: r.id,
    titulo: r.titulo_id,
    numero: r.numero,
    total: r.total_parcelas,
    l: r.tipo === 'PAGAR' ? 'p' : 'r',
    doc: r.tipo_documento,
    nome: r.pessoa_nome,
    v: r.vencimento,
    s: Number(r.valor),
    f: conv(r.rateio),
  }));

  pls.forEach((t) => {
    const d = t.dados || {};
    const pj = d.projetado || {};
    const contas = d.contas || {};
    const valorDe = (k) => Math.round(Number(pj[k] || 0) * 100) / 100;
    const base = { titulo: t.titulo_id, total: 1, l: t.tipo === 'PAGAR' ? 'p' : 'r', doc: 'PROJECAO_PLS_CEF', nome: t.pessoa_nome };
    // Sem as datas ou os valores guardados (título antigo), fica com as parcelas em aberto como estão.
    if (!d.data_pf || !d.data_pj || !d.projetado) {
      (t.abertas || []).forEach((p) =>
        itens.push({ ...base, id: p.id, numero: p.numero, total: t.total_parcelas, v: p.vencimento, s: Number(p.valor), f: conv(t.rateio) })
      );
      return;
    }
    const partes = [
      { parte: 'PF', v: d.data_pf, chaves: ['novo_registro', 'medicao'] },
      { parte: 'PJ', v: d.data_pj, chaves: ['credito_pj'] },
    ];
    partes.forEach(({ parte, v, chaves }) => {
      const comValor = chaves.filter((k) => valorDe(k) > 0);
      const s = Math.round(comValor.reduce((acc, k) => acc + valorDe(k), 0) * 100) / 100;
      if (!(s > 0)) return;
      itens.push({
        ...base,
        id: `${t.titulo_id}-${parte}`,
        numero: 1,
        parte,
        v,
        s,
        f: comValor.map((k) => [d.centro_id === undefined || d.centro_id === null ? null : Number(d.centro_id), contas[k] ? String(contas[k]) : null, valorDe(k) / s]),
      });
    });
  });

  return itens.sort((a, b) => (a.v < b.v ? -1 : a.v > b.v ? 1 : a.titulo - b.titulo));
}

// `LADOS` e `titulosDoLado` também são usados pelo Detalhamento Financeiro (detalhamentoPainel.service.js):
// o "em aberto" de lá é o mesmo do Aging List.
module.exports = { painel, LADOS, titulosDoLado };
