const pool = require('../../config/db');
const unidades = require('../dre-unidades/unidades.service');
const correcoes = require('../dre-correcoes/correcoes.service');
const financeiro = require('../dre-financeiro/financeiro.service');
const { arredondarPoc } = require('../../utils/poc');

// Operações > DRE Gerencial > DRE: a coluna Valor de cada Máscara DRE de nível 2 num período
// (de/até, inclusive), somando os centros de custo com "Realiza DRE" (ou os do filtro). Inspirado no
// calc_dre_poc.py do usuário. Por enquanto só os cálculos da RECEITA BRUTA (aba Máscaras, Origem +
// Cálculo) e o Imposto Fixo (RET); os demais voltam null e a tela mostra traço.
//
// Base de cada cálculo — datas e valores das próprias abas da DRE, pra bater com elas:
//   VALOR_VENDAS       — aba Unidades, Vendidas: todo contrato (até o cancelado depois), data do
//                        contrato, valor do contrato × participação da unidade.
//   RECEITA_PERMUTA    — aba Unidades, Permuta: data e valor da avaliação.
//   CORRECAO_MONETARIA — aba Correções: paga + reparcelada + em aberto, pelo vencimento da parcela.
//   ESTORNO_VENDAS     — aba Unidades, Distratadas: data do distrato, −valor do contrato.
//   RECEITA_DISTRATO   — aba Unidades, Distratadas: data do distrato, receita com distrato (o que o
//                        cliente pagou) + despesa com distrato (−o que se devolve).
//
// POC de Receita (máscara marcada "% POC" + Tipo POC Receita), por obra, como o delta_poc do script:
//   POC(D)          = custo acumulado até D na Máscara DRE Nível 2 da aba Configurações ÷ orçamento
//                     vigente em D (aba Orçamento: o de início mais recente até D), até 100%, com
//                     6 casas decimais no percentual (utils/poc.js);
//   reconhecido(D)  = base acumulada até D × POC(D);
//   valor em [a, b] = reconhecido(b) − reconhecido(véspera de a).
// Assim o período já desconta o que foi reconhecido antes dele (venda antiga só entra pelo avanço da
// obra no período; venda nova entra com todo o avanço já feito). Somado mês a mês dá o mesmo que o
// script. Sem a máscara configurada a POC de Receita não é gerada (essas linhas voltam null).
// Máscara sem "% POC": a base dentro do intervalo, direto.
//
// Imposto Fixo (RET): −alíquota × tudo o que está acima dele na DRE (as linhas de nível 2 antes dele,
// na ordem da aba Máscaras), mês a mês, cada mês com a alíquota do histórico vigente nele (a de
// início mais recente até o mês; antes da primeira, 0). O período é quebrado nos meses (o primeiro e
// o último podem ser parciais) e os valores de cada mês são os reconhecidos naquele mês. Se alguma
// linha acima ainda não tem cálculo, o imposto também fica null.

const CALCULOS_RECEITA = new Set(['VALOR_VENDAS', 'RECEITA_PERMUTA', 'CORRECAO_MONETARIA', 'ESTORNO_VENDAS', 'RECEITA_DISTRATO']);

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

function somarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const vespera = (iso) => somarDias(iso, -1);
const fimDoMes = (iso) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0)).toISOString().slice(0, 10);

// Intervalos mensais [a, b] que cobrem [de, ate] (o primeiro e o último podem ser parciais).
function meses(de, ate) {
  const lista = [];
  for (let a = de; a <= ate; ) {
    const b = fimDoMes(a) < ate ? fimDoMes(a) : ate;
    lista.push([a, b]);
    a = somarDias(b, 1);
  }
  return lista;
}

// Série acumulada por centro: { centro_id: { datas: [...ordenadas], acum: [...] } }; `ate(c, D)` =
// soma até D (inclusive), por busca binária.
function serie(linhas) {
  const porCentro = new Map();
  linhas.forEach((l) => {
    if (!porCentro.has(l.centro_id)) porCentro.set(l.centro_id, new Map());
    const m = porCentro.get(l.centro_id);
    m.set(l.data, (m.get(l.data) || 0) + l.valor);
  });
  const s = new Map();
  porCentro.forEach((m, centroId) => {
    const datas = [...m.keys()].sort();
    let total = 0;
    s.set(centroId, { datas, acum: datas.map((d) => (total += m.get(d))) });
  });
  return (centroId, data) => {
    const x = s.get(centroId);
    if (!x) return 0;
    let lo = 0;
    let hi = x.datas.length - 1;
    let r = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (x.datas[mid] <= data) {
        r = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return r < 0 ? 0 : x.acum[r];
  };
}

// Lançamentos-base { centro_id, data 'AAAA-MM-DD', valor } de cada cálculo, dos centros pedidos.
async function bases(empresaId, centroOk) {
  const [{ centros }, { rows: corr }] = await Promise.all([
    unidades.listar(empresaId),
    pool.query(
      `SELECT centro_id::int AS centro_id, to_char(due_date, 'YYYY-MM-DD') AS data,
              SUM(paga + reparcelada + em_aberto) AS valor
         FROM (${correcoes.sqlParcelas()}) t
        GROUP BY 1, 2`,
      [empresaId]
    ),
  ]);
  const b = Object.fromEntries([...CALCULOS_RECEITA].map((c) => [c, []]));
  const add = (calculo, centroId, data, valor) => {
    if (!data || !centroOk(centroId) || !valor) return;
    b[calculo].push({ centro_id: centroId, data, valor });
  };
  centros.forEach((c) => {
    c.clusters.vendidas.forEach((v) => add('VALOR_VENDAS', c.id, v.data, num(v.valor)));
    c.clusters.permuta.forEach((p) => add('RECEITA_PERMUTA', c.id, p.data, num(p.valor)));
    c.clusters.distratadas.forEach((d) => {
      add('ESTORNO_VENDAS', c.id, d.data, -num(d.valor));
      add('RECEITA_DISTRATO', c.id, d.data, num(d.receita_distrato) + num(d.despesa_distrato));
    });
  });
  corr.forEach((r) => add('CORRECAO_MONETARIA', r.centro_id, r.data, num(r.valor)));
  return Object.fromEntries(Object.entries(b).map(([calculo, linhas]) => [calculo, serie(linhas)]));
}

// POC de Receita de uma obra em qualquer data até `ate`: custo acumulado da máscara ÷ orçamento
// vigente. Devolve `pocEm(centro, D)` → { poc, custo, orcamento } (com cache).
async function pocReceita(empresaId, mascaraId, ate) {
  const [custos, { rows: orcamentos }] = await Promise.all([
    financeiro.somaPorCentroData(empresaId, mascaraId, ate),
    pool.query(
      `SELECT sienge_id::int AS centro_id, to_char(data_inicio, 'YYYY-MM-DD') AS inicio, SUM(valor) AS total
         FROM dre_orcamento_valores
        WHERE empresa_id = $1 AND data_inicio <= $2
        GROUP BY 1, 2 ORDER BY 1, 2`,
      [empresaId, ate]
    ),
  ]);
  const custoAte = serie(custos);
  const versoes = new Map();
  orcamentos.forEach((o) => {
    if (!versoes.has(o.centro_id)) versoes.set(o.centro_id, []);
    versoes.get(o.centro_id).push({ inicio: o.inicio, total: num(o.total) });
  });
  const cache = new Map();
  return (centroId, data) => {
    const chave = `${centroId}|${data}`;
    if (!cache.has(chave)) {
      const v = (versoes.get(centroId) || []).filter((x) => x.inicio <= data).pop();
      const orcamento = v ? v.total : 0;
      const custo = Math.abs(custoAte(centroId, data));
      cache.set(chave, { poc: orcamento > 0 ? arredondarPoc(Math.min(custo / orcamento, 1)) : 0, custo, orcamento });
    }
    return cache.get(chave);
  };
}

async function calcular(empresaId, { de, ate, centros: filtro = [] }) {
  const [{ rows: centrosDre }, { rows: mascaras }, { rows: cfg }, { rows: aliquotas }] = await Promise.all([
    pool.query(
      'SELECT sienge_id::int AS id, name AS nome FROM centros_custo_sienge WHERE empresa_id = $1 AND realiza_dre ORDER BY sienge_id',
      [empresaId]
    ),
    // Nível 2 na ordem da DRE (grupo de nível 1, depois a ordem dentro dele) — "acima" do imposto.
    pool.query(
      `SELECT m.id, m.descricao, m.realiza_poc, m.tipo_poc, m.origem, m.calculo
         FROM dre_mascaras m JOIN dre_mascaras p ON p.id = m.parent_id
        WHERE m.empresa_id = $1
        ORDER BY p.ordem, m.ordem`,
      [empresaId]
    ),
    pool.query(
      `SELECT c.poc_receita_mascara_id AS id, m.descricao
         FROM dre_configuracoes c JOIN dre_mascaras m ON m.id = c.poc_receita_mascara_id
        WHERE c.empresa_id = $1`,
      [empresaId]
    ),
    pool.query(
      `SELECT h.mascara_id, to_char(h.inicio, 'YYYY-MM-DD') AS inicio, h.aliquota
         FROM dre_mascaras_imposto_historico h JOIN dre_mascaras m ON m.id = h.mascara_id
        WHERE m.empresa_id = $1
        ORDER BY h.mascara_id, h.inicio`,
      [empresaId]
    ),
  ]);
  const pedidos = new Set(filtro.map(Number));
  const obras = centrosDre.filter((c) => !pedidos.size || pedidos.has(c.id));
  const ids = obras.map((c) => c.id);
  const idsOk = new Set(ids);
  const mascaraPoc = cfg[0] ? { id: cfg[0].id, descricao: cfg[0].descricao } : null;
  const antes = vespera(de);

  const comPocReceita = (m) => CALCULOS_RECEITA.has(m.calculo) && m.realiza_poc && m.tipo_poc === 'RECEITA';
  const usaPoc = mascaraPoc && mascaras.some(comPocReceita);
  const [base, pocEm] = await Promise.all([
    bases(empresaId, (id) => idsOk.has(Number(id))),
    usaPoc ? pocReceita(empresaId, mascaraPoc.id, ate) : Promise.resolve(null),
  ]);

  // Reconhecido acumulado de uma máscara até D (todos os centros pedidos); null = sem cálculo.
  const calculavel = (m) => CALCULOS_RECEITA.has(m.calculo) && !(m.realiza_poc && m.tipo_poc !== 'RECEITA') && (!comPocReceita(m) || pocEm);
  const reconhecido = (m, data) =>
    ids.reduce((s, id) => s + base[m.calculo](id, data) * (comPocReceita(m) ? pocEm(id, data).poc : 1), 0);
  const valorEm = (m, a, b) => reconhecido(m, b) - reconhecido(m, vespera(a));

  // Alíquota (%) vigente num mês, pelo histórico do imposto.
  const historico = new Map();
  aliquotas.forEach((h) => {
    if (!historico.has(h.mascara_id)) historico.set(h.mascara_id, []);
    historico.get(h.mascara_id).push({ inicio: h.inicio, aliquota: num(h.aliquota) });
  });
  const aliquotaEm = (mascaraId, data) => (historico.get(mascaraId) || []).filter((h) => h.inicio <= data).pop()?.aliquota || 0;

  const valores = {};
  const intervalos = meses(de, ate);
  mascaras.forEach((m, i) => {
    if (m.origem === 'IMPOSTO_FIXO') {
      const acima = mascaras.slice(0, i);
      if (!acima.length || !acima.every(calculavel)) {
        valores[m.id] = null;
        return;
      }
      valores[m.id] = intervalos.reduce((s, [a, b]) => {
        const aliquota = aliquotaEm(m.id, a.slice(0, 8) + '01');
        if (!aliquota) return s;
        const baseMes = acima.reduce((t, x) => t + valorEm(x, a, b), 0);
        return s - (baseMes * aliquota) / 100;
      }, 0);
      return;
    }
    valores[m.id] = calculavel(m) ? valorEm(m, de, ate) : null;
  });

  return {
    de,
    ate,
    centros: ids,
    poc_receita: {
      mascara: mascaraPoc,
      obras: obras.map((c) => ({
        centro_id: c.id,
        nome: c.nome,
        poc_inicio: pocEm ? pocEm(c.id, antes).poc : null,
        poc_fim: pocEm ? pocEm(c.id, ate).poc : null,
        custo_fim: pocEm ? pocEm(c.id, ate).custo : null,
        orcamento_fim: pocEm ? pocEm(c.id, ate).orcamento : null,
      })),
    },
    valores,
  };
}

module.exports = { calcular };
