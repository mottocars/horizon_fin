const pool = require('../../config/db');
const unidades = require('../dre-unidades/unidades.service');
const correcoes = require('../dre-correcoes/correcoes.service');
const financeiro = require('../dre-financeiro/financeiro.service');

// Operações > DRE Gerencial > DRE: a coluna Valor de cada Máscara DRE de nível 2 num período
// (de/até, inclusive), somando os centros de custo com "Realiza DRE" (ou os do filtro). Inspirado no
// calc_dre_poc.py do usuário. Por enquanto só os cálculos da RECEITA BRUTA (aba Máscaras, Origem +
// Cálculo); os demais voltam null e a tela mostra traço.
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
//                     vigente em D (aba Orçamento: o de início mais recente até D), até 100%;
//   reconhecido(D)  = base acumulada até D × POC(D);
//   valor           = reconhecido(até) − reconhecido(véspera do de).
// Assim o período já desconta o que foi reconhecido antes dele (venda antiga só entra pelo avanço da
// obra no período; venda nova entra com todo o avanço já feito). Somado mês a mês dá o mesmo que o
// script. Sem a máscara configurada a POC de Receita não é gerada (essas linhas voltam null).
// Máscara sem "% POC": a base dentro do período, direto.

const CALCULOS_RECEITA = new Set(['VALOR_VENDAS', 'RECEITA_PERMUTA', 'CORRECAO_MONETARIA', 'ESTORNO_VENDAS', 'RECEITA_DISTRATO']);

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

function vespera(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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
  return b;
}

// POC de Receita de cada obra numa data: { centro_id: { poc, custo, orcamento } }.
async function pocReceitaEm(empresaId, mascaraId, data) {
  const [custos, { rows: orcamentos }] = await Promise.all([
    financeiro.somaPorCentro(empresaId, mascaraId, data),
    pool.query(
      `SELECT DISTINCT ON (sienge_id) sienge_id::int AS centro_id, total
         FROM (SELECT sienge_id, data_inicio, SUM(valor) AS total FROM dre_orcamento_valores
                WHERE empresa_id = $1 AND data_inicio <= $2 GROUP BY 1, 2) o
        ORDER BY sienge_id, data_inicio DESC`,
      [empresaId, data]
    ),
  ]);
  const custo = new Map(custos.map((c) => [c.centro_id, Math.abs(c.valor)]));
  const mapa = {};
  orcamentos.forEach((o) => {
    const orcamento = num(o.total);
    const c = custo.get(o.centro_id) || 0;
    mapa[o.centro_id] = { poc: orcamento > 0 ? Math.min(c / orcamento, 1) : 0, custo: c, orcamento };
  });
  custo.forEach((c, centroId) => {
    if (!mapa[centroId]) mapa[centroId] = { poc: 0, custo: c, orcamento: 0 };
  });
  return mapa;
}

async function calcular(empresaId, { de, ate, centros: filtro = [] }) {
  const [{ rows: centrosDre }, { rows: mascaras }, { rows: cfg }] = await Promise.all([
    pool.query(
      'SELECT sienge_id::int AS id, name AS nome FROM centros_custo_sienge WHERE empresa_id = $1 AND realiza_dre ORDER BY sienge_id',
      [empresaId]
    ),
    pool.query(
      `SELECT id, descricao, realiza_poc, tipo_poc, calculo FROM dre_mascaras
        WHERE empresa_id = $1 AND parent_id IS NOT NULL`,
      [empresaId]
    ),
    pool.query(
      `SELECT c.poc_receita_mascara_id AS id, m.descricao
         FROM dre_configuracoes c JOIN dre_mascaras m ON m.id = c.poc_receita_mascara_id
        WHERE c.empresa_id = $1`,
      [empresaId]
    ),
  ]);
  const pedidos = new Set(filtro.map(Number));
  const obras = centrosDre.filter((c) => !pedidos.size || pedidos.has(c.id));
  const ids = new Set(obras.map((c) => c.id));
  const centroOk = (id) => ids.has(Number(id));
  const mascaraPoc = cfg[0] ? { id: cfg[0].id, descricao: cfg[0].descricao } : null;
  const antes = vespera(de);

  const usaPoc = mascaras.some((m) => CALCULOS_RECEITA.has(m.calculo) && m.realiza_poc && m.tipo_poc === 'RECEITA');
  const [base, pocFim, pocIni] = await Promise.all([
    bases(empresaId, centroOk),
    mascaraPoc && usaPoc ? pocReceitaEm(empresaId, mascaraPoc.id, ate) : Promise.resolve({}),
    mascaraPoc && usaPoc ? pocReceitaEm(empresaId, mascaraPoc.id, antes) : Promise.resolve({}),
  ]);
  const pocDe = (mapa, centroId) => mapa[centroId]?.poc || 0;

  const valores = {};
  mascaras.forEach((m) => {
    if (!CALCULOS_RECEITA.has(m.calculo)) {
      valores[m.id] = null;
      return;
    }
    const linhas = base[m.calculo];
    if (m.realiza_poc && m.tipo_poc === 'RECEITA') {
      if (!mascaraPoc) {
        valores[m.id] = null;
        return;
      }
      // Base acumulada por obra até a véspera do início e até o fim.
      const acumIni = new Map();
      const acumFim = new Map();
      linhas.forEach((l) => {
        if (l.data <= antes) acumIni.set(l.centro_id, (acumIni.get(l.centro_id) || 0) + l.valor);
        if (l.data <= ate) acumFim.set(l.centro_id, (acumFim.get(l.centro_id) || 0) + l.valor);
      });
      let total = 0;
      ids.forEach((id) => {
        total += (acumFim.get(id) || 0) * pocDe(pocFim, id) - (acumIni.get(id) || 0) * pocDe(pocIni, id);
      });
      valores[m.id] = total;
    } else if (m.realiza_poc) {
      valores[m.id] = null; // POC de Despesa: fica pra depois
    } else {
      valores[m.id] = linhas.filter((l) => l.data >= de && l.data <= ate).reduce((s, l) => s + l.valor, 0);
    }
  });

  return {
    de,
    ate,
    centros: obras.map((c) => c.id),
    poc_receita: {
      mascara: mascaraPoc,
      obras: obras.map((c) => ({
        centro_id: c.id,
        nome: c.nome,
        poc_inicio: pocFim[c.id] || pocIni[c.id] ? pocDe(pocIni, c.id) : null,
        poc_fim: pocFim[c.id] ? pocDe(pocFim, c.id) : null,
        custo_fim: pocFim[c.id]?.custo ?? null,
        orcamento_fim: pocFim[c.id]?.orcamento ?? null,
      })),
    },
    valores,
  };
}

module.exports = { calcular };
