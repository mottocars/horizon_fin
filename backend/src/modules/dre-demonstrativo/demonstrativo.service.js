const pool = require('../../config/db');
const unidades = require('../dre-unidades/unidades.service');
const correcoes = require('../dre-correcoes/correcoes.service');
const financeiro = require('../dre-financeiro/financeiro.service');
const { arredondarPoc } = require('../../utils/poc');
const { ORDEM: ORDEM_CENTROS } = require('../dre-centros/dreCentros.service');

// Operações > DRE Gerencial > DRE: a coluna Valor de cada Máscara DRE de nível 2 num período
// (de/até, inclusive), somando os centros de custo com "Realiza DRE" (ou os do filtro). Inspirado no
// calc_dre_poc.py do usuário. Cálculos da RECEITA BRUTA (aba Máscaras, Origem + Cálculo), o Imposto
// Fixo (RET), o CIV e as demais linhas do Financeiro (Entradas e Saídas); máscara sem cálculo volta
// null e a tela mostra traço.
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
// CIV (POC de Despesa, como o proc_custo_imoveis / proc_estorno_custo do script) — no grupo de nível 1
// que tem a linha de Estorno de Custo:
//   custo (Financeiro + Entradas e Saídas, "% POC" Despesa) — base = linhas da aba Financeiro dessa
//                        máscara (naturezas que o plano de contas do centro manda pra ela), com sinal
//                        (custo negativo), pela data; reconhecido(D) = custo acumulado × POC Despesa(D);
//   ESTORNO_CUSTO      — reconhecido(D) = −(custo acumulado dos custos do mesmo grupo) × fração
//                        distratada(D): devolve o custo das unidades distratadas.
//   POC Despesa(D)     = fração ideal de todo contrato até D (até o cancelado depois, × participação
//                        da unidade no contrato) + das permutas (data da avaliação) — como a Venda de
//                        imóveis, o distrato sai pelo Estorno de Custo; sem trava, como no script;
//   fração distratada(D) = fração ideal dos contratos distratados até D (data do distrato), até 100%.
// Mesmo delta da POC de Receita: valor em [a, b] = reconhecido(b) − reconhecido(véspera de a).
//
// Demais linhas do Financeiro (Entradas e Saídas), fora do grupo do CIV — mesma base (aba Financeiro
// da máscara, com sinal, pela data de emissão; no movimento do extrato, a data dele):
//   com "% POC" Despesa (ex.: comissão, legalização) — mesma premissa do CIV, mas sem linha de
//                        estorno pra devolver o distrato: reconhecido(D) = base acumulada × (POC
//                        Despesa(D) − fração distratada(D)), o mesmo que o CIV dá líquido do estorno;
//   sem "% POC"        — o valor lançado no período, direto.
//
// Resposta: `valores` (o consolidado do período), `por_centro` (o período de cada centro — a soma
// deles é o consolidado — e os meses dele) e `meses` (o consolidado de cada mês).
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

// Lançamentos-base { centro_id, data 'AAAA-MM-DD', valor } de cada cálculo, dos centros pedidos, e as
// frações ideais da POC de Despesa (FRACAO_VENDIDA, FRACAO_DISTRATADA).
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
  const b = Object.fromEntries([...CALCULOS_RECEITA, 'FRACAO_VENDIDA', 'FRACAO_DISTRATADA'].map((c) => [c, []]));
  const add = (calculo, centroId, data, valor) => {
    if (!data || !centroOk(centroId) || !valor) return;
    b[calculo].push({ centro_id: centroId, data, valor });
  };
  centros.forEach((c) => {
    c.clusters.vendidas.forEach((v) => {
      add('VALOR_VENDAS', c.id, v.data, num(v.valor));
      add('FRACAO_VENDIDA', c.id, v.data, num(v.fracao_ideal) * v.participacao);
    });
    c.clusters.permuta.forEach((p) => {
      add('RECEITA_PERMUTA', c.id, p.data, num(p.valor));
      add('FRACAO_VENDIDA', c.id, p.data, num(p.fracao_ideal));
    });
    c.clusters.distratadas.forEach((d) => {
      add('ESTORNO_VENDAS', c.id, d.data, -num(d.valor));
      add('RECEITA_DISTRATO', c.id, d.data, num(d.receita_distrato) + num(d.despesa_distrato));
      add('FRACAO_DISTRATADA', c.id, d.data, num(d.fracao_ideal) * d.participacao);
    });
  });
  corr.forEach((r) => add('CORRECAO_MONETARIA', r.centro_id, r.data, num(r.valor)));
  return Object.fromEntries(Object.entries(b).map(([calculo, linhas]) => [calculo, serie(linhas)]));
}

// POC de Receita de uma obra em qualquer data até `ate`: custo acumulado da máscara (`custoAte`,
// série do Financeiro) ÷ orçamento vigente. Devolve `pocEm(centro, D)` → { poc, custo, orcamento }
// (com cache).
async function pocReceita(empresaId, custoAte, ate) {
  const { rows: orcamentos } = await pool.query(
    `SELECT sienge_id::int AS centro_id, to_char(data_inicio, 'YYYY-MM-DD') AS inicio, SUM(valor) AS total
       FROM dre_orcamento_valores
      WHERE empresa_id = $1 AND data_inicio <= $2
      GROUP BY 1, 2 ORDER BY 1, 2`,
    [empresaId, ate]
  );
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
      `SELECT sienge_id::int AS id, name AS nome, COALESCE(NULLIF(TRIM(apelido), ''), name) AS rotulo
         FROM centros_custo_sienge WHERE empresa_id = $1 AND realiza_dre ORDER BY ${ORDEM_CENTROS}`,
      [empresaId]
    ),
    // Nível 2 na ordem da DRE (grupo de nível 1, depois a ordem dentro dele) — "acima" do imposto.
    pool.query(
      `SELECT m.id, m.parent_id, m.descricao, m.realiza_poc, m.tipo_poc, m.origem, m.calculo
         FROM dre_mascaras m JOIN dre_mascaras p ON p.id = m.parent_id
        WHERE m.empresa_id = $1
        ORDER BY p.ordem, m.ordem`,
      [empresaId]
    ),
    pool.query(
      `SELECT c.poc_receita_mascara_id AS id, m.descricao, c.av_mascara_id, a.descricao AS av_descricao
         FROM dre_configuracoes c
         LEFT JOIN dre_mascaras m ON m.id = c.poc_receita_mascara_id
         LEFT JOIN dre_mascaras a ON a.id = c.av_mascara_id
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
  const mascaraPoc = cfg[0]?.id ? { id: cfg[0].id, descricao: cfg[0].descricao } : null;
  const antes = vespera(de);

  const comPocReceita = (m) => CALCULOS_RECEITA.has(m.calculo) && m.realiza_poc && m.tipo_poc === 'RECEITA';
  const usaPoc = mascaraPoc && mascaras.some(comPocReceita);
  // Linhas do Financeiro; CIV = as com POC de Despesa do grupo que tem o Estorno de Custo.
  const gruposCiv = new Set(mascaras.filter((m) => m.calculo === 'ESTORNO_CUSTO').map((m) => m.parent_id));
  const doFinanceiro = (m) => m.origem === 'FINANCEIRO' && m.calculo === 'ENTRADAS_SAIDAS';
  const comPocDespesa = (m) => doFinanceiro(m) && m.realiza_poc && m.tipo_poc === 'DESPESA';
  const custoCiv = (m) => comPocDespesa(m) && gruposCiv.has(m.parent_id);
  const semPoc = (m) => doFinanceiro(m) && !m.realiza_poc;
  const idsFinanceiro = [
    ...new Set([...(usaPoc ? [mascaraPoc.id] : []), ...mascaras.filter((m) => comPocDespesa(m) || semPoc(m)).map((m) => m.id)]),
  ];
  const [base, custos] = await Promise.all([
    bases(empresaId, (id) => idsOk.has(Number(id))),
    idsFinanceiro.length ? financeiro.somaPorCentroData(empresaId, idsFinanceiro, ate) : Promise.resolve([]),
  ]);
  const custoAte = new Map(idsFinanceiro.map((id) => [id, serie(custos.filter((c) => c.mascara_id === id))]));
  const pocEm = usaPoc ? await pocReceita(empresaId, custoAte.get(mascaraPoc.id), ate) : null;
  const pocDespesa = (id, data) => arredondarPoc(base.FRACAO_VENDIDA(id, data));
  const fracaoDistratada = (id, data) => arredondarPoc(Math.min(base.FRACAO_DISTRATADA(id, data), 1));
  // Custos do CIV que o Estorno de Custo devolve: os do mesmo grupo de nível 1.
  const custosDoGrupo = (m) => mascaras.filter((x) => custoCiv(x) && x.parent_id === m.parent_id);

  // Reconhecido acumulado de uma máscara até D (nos centros da `lista`); null = sem cálculo.
  const calculavel = (m) =>
    (CALCULOS_RECEITA.has(m.calculo) && !(m.realiza_poc && m.tipo_poc !== 'RECEITA') && (!comPocReceita(m) || pocEm)) ||
    comPocDespesa(m) ||
    semPoc(m) ||
    m.calculo === 'ESTORNO_CUSTO';
  const reconhecidoNoCentro = (m, id, data) => {
    if (custoCiv(m)) return custoAte.get(m.id)(id, data) * pocDespesa(id, data);
    if (comPocDespesa(m)) return custoAte.get(m.id)(id, data) * (pocDespesa(id, data) - fracaoDistratada(id, data));
    if (semPoc(m)) return custoAte.get(m.id)(id, data);
    if (m.calculo === 'ESTORNO_CUSTO')
      return -custosDoGrupo(m).reduce((s, x) => s + custoAte.get(x.id)(id, data), 0) * fracaoDistratada(id, data);
    return base[m.calculo](id, data) * (comPocReceita(m) ? pocEm(id, data).poc : 1);
  };
  const reconhecido = (m, data, lista) => lista.reduce((s, id) => s + reconhecidoNoCentro(m, id, data), 0);
  const valorEm = (m, a, b, lista) => reconhecido(m, b, lista) - reconhecido(m, vespera(a), lista);

  // Alíquota (%) vigente num mês, pelo histórico do imposto.
  const historico = new Map();
  aliquotas.forEach((h) => {
    if (!historico.has(h.mascara_id)) historico.set(h.mascara_id, []);
    historico.get(h.mascara_id).push({ inicio: h.inicio, aliquota: num(h.aliquota) });
  });
  const aliquotaEm = (mascaraId, data) => (historico.get(mascaraId) || []).filter((h) => h.inicio <= data).pop()?.aliquota || 0;

  // Valores de cada máscara num mês [a, b] nos centros da `lista` (o imposto com a alíquota vigente
  // nele). Lista vazia = zero nas máscaras com cálculo, null nas sem.
  const valoresDoMes = (a, b, lista) => {
    const valores = {};
    mascaras.forEach((m, i) => {
      if (m.origem === 'IMPOSTO_FIXO') {
        const acima = mascaras.slice(0, i);
        if (!acima.length || !acima.every(calculavel)) {
          valores[m.id] = null;
          return;
        }
        const aliquota = aliquotaEm(m.id, a.slice(0, 8) + '01');
        valores[m.id] = aliquota ? -(acima.reduce((t, x) => t + valorEm(x, a, b, lista), 0) * aliquota) / 100 : 0;
        return;
      }
      valores[m.id] = calculavel(m) ? valorEm(m, a, b, lista) : null;
    });
    return valores;
  };
  // Soma de vários conjuntos de valores, máscara a máscara (null se algum for null), partindo de `base`.
  const somar = (base, lista) =>
    Object.fromEntries(
      mascaras.map((m) => [m.id, [base, ...lista].some((v) => v[m.id] === null) ? null : lista.reduce((t, v) => t + v[m.id], base[m.id])])
    );
  // Mês a mês (o primeiro e o último podem ser parciais), cada centro sozinho; o total do período é a
  // soma dos meses — o mesmo que calcular [de, até] direto, já que cada mês desconta o reconhecido
  // antes. Tudo é linear (inclusive o RET, alíquota × base do mês), então o consolidado de cada mês é
  // a soma dos centros.
  const intervalos = meses(de, ate);
  const vazio = (a, b) => valoresDoMes(a, b, []);
  const porCentro = obras.map((c) => {
    const doCentro = intervalos.map(([a, b]) => valoresDoMes(a, b, [c.id]));
    return { id: c.id, nome: c.rotulo, meses: doCentro, valores: somar(vazio(de, ate), doCentro) };
  });
  const porMes = intervalos.map(([a, b], i) => ({
    mes: a.slice(0, 7),
    de: a,
    ate: b,
    valores: somar(vazio(a, b), porCentro.map((c) => c.meses[i])),
  }));
  const valores = somar(vazio(de, ate), porMes.map((x) => x.valores));

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
    poc_despesa: obras.map((c) => ({
      centro_id: c.id,
      nome: c.nome,
      poc_inicio: pocDespesa(c.id, antes),
      poc_fim: pocDespesa(c.id, ate),
      fracao_distratada_fim: fracaoDistratada(c.id, ate),
    })),
    // Linha de nível 1 que vale 100% na AV % (aba Configurações); a tela faz a conta.
    avaliacao_vertical: cfg[0]?.av_mascara_id ? { mascara_id: cfg[0].av_mascara_id, descricao: cfg[0].av_descricao } : null,
    valores,
    meses: porMes,
    // Colunas dos centros na tela (na ordem da aba Centros Custos): o total do período de cada um e os
    // meses (a visão mês a mês de um centro, com a AH %).
    por_centro: porCentro.map(({ id, nome, valores: v, meses: doCentro }) => ({
      id,
      nome,
      valores: v,
      meses: doCentro.map((valoresMes, i) => ({ mes: porMes[i].mes, de: porMes[i].de, ate: porMes[i].ate, valores: valoresMes })),
    })),
  };
}

module.exports = { calcular };
