const pool = require('../../config/db');

// Ficha de desembolso de uma natureza (Origem Projeção "SIENGE - EMPRESARIAL DESEMBOLSO", aba
// Plano Contas — pedido do usuário): como o contas a pagar dela costuma ser pago, olhando a
// emissão x o vencimento de cada título emitido nos últimos 12 meses. Mesma análise feita à parte
// pro usuário (relatório "Prazos de Desembolso"):
// - valor de cada parcela = original + desconto − taxas, rateado pela natureza (igual ao Aging a pagar);
// - fora: previsões financeiras e parcelas baixadas por Cancelamento (3) ou Substituição (5);
// - "prazo" = dias da emissão ao vencimento da parcela; médias e distribuições pesadas pelo valor;
// - padrão do título: "2x · 1ª em 28d · mensal"; curva = parte do valor que vence no mês da
//   emissão (M0), no seguinte (M+1)...
// Guardada em dfc_desembolso_fichas — o "Prazo Desembolso" da coluna é o prazo médio.

const ORIGEM = 'SIENGE_ORCAMENTO_EMPRESARIAL';
const TERMOS = [7, 10, 14, 15, 20, 21, 25, 28, 30, 35, 40, 45, 50, 56, 60, 75, 90, 105, 120, 150, 180];
const FAIXAS = [
  ['Na emissão ou antes', -Infinity, 0],
  ['1 a 15 dias', 1, 15],
  ['16 a 30 dias', 16, 30],
  ['31 a 45 dias', 31, 45],
  ['46 a 60 dias', 46, 60],
  ['61 a 90 dias', 61, 90],
  ['91 a 180 dias', 91, 180],
  ['Mais de 180 dias', 181, Infinity],
];
const CURVA = ['M0', 'M+1', 'M+2', 'M+3', 'M+4', 'M+5', 'M+6 ou mais'];

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// 'AAAA-MM-DD' -> dia absoluto / mês absoluto (sem fuso).
const dia = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 86400000;
const mesAbs = (s) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7));
const um = (v) => Math.round(v * 10) / 10;

function termo(d) {
  if (d <= 2) return 'à vista';
  const melhor = TERMOS.reduce((a, t) => (Math.abs(t - d) < Math.abs(a - d) ? t : a));
  if (Math.abs(melhor - d) <= 2) return `${melhor}d`;
  return d <= 365 ? `${d}d` : '>1 ano';
}

function frequencia(intervalos) {
  if (!intervalos.length) return '';
  const m = [...intervalos].sort((a, b) => a - b)[Math.floor(intervalos.length / 2)];
  if (m >= 25 && m <= 35) return 'mensal';
  if (m >= 13 && m <= 17) return 'quinzenal';
  if (m >= 6 && m <= 8) return 'semanal';
  if (m >= 55 && m <= 65) return 'bimestral';
  if (m <= 2) return 'mesmo dia';
  return `a cada ${m}d`;
}

function medianaPonderada(pares) {
  const ordenados = [...pares].sort((a, b) => a[0] - b[0]);
  const total = ordenados.reduce((t, [, w]) => t + w, 0);
  let acc = 0;
  for (const [v, w] of ordenados) {
    acc += w;
    if (acc >= total / 2) return v;
  }
  return null;
}

// Período: os 12 meses que terminam hoje (relógio da aplicação).
function periodo() {
  const hoje = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const de = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate() + 1);
  return { de: iso(de), ate: iso(hoje) };
}

// Calcula a ficha (sem gravar).
async function calcular(empresaId, siengeId) {
  const { de, ate } = periodo();
  const { rows } = await pool.query(
    `SELECT so.bill_id, so.issue_date, so.due_date, so.creditor_id, so.creditor_name,
            (COALESCE(so.original_amount, 0) + COALESCE(so.discount_amount, 0) - COALESCE(so.tax_amount, 0))
              * COALESCE(c.financial_category_rate, 0) / 100 AS valor
       FROM sie_outcome so
       JOIN sie_outcome_categorias c
         ON c.empresa_id = so.empresa_id AND c.bill_id = so.bill_id AND c.installment_id = so.installment_id
      WHERE so.empresa_id = $1 AND c.financial_category_id = $2::text
        AND so.issue_date BETWEEN $3 AND $4 AND so.due_date IS NOT NULL
        AND COALESCE(so.document_identification_name, '') NOT ILIKE '%PREVIS%'
        AND NOT EXISTS (SELECT 1 FROM sie_outcome_pagamentos p
                         WHERE p.empresa_id = so.empresa_id AND p.bill_id = so.bill_id
                           AND p.installment_id = so.installment_id AND p.operation_type_id IN (3, 5))`,
    [empresaId, siengeId, de, ate]
  );
  const parcelas = rows
    .map((r) => ({
      ...r,
      valor: Number(r.valor),
      prazo: dia(r.due_date) - dia(r.issue_date),
      mes: mesAbs(r.due_date) - mesAbs(r.issue_date),
    }))
    .filter((r) => r.valor > 0);

  const total = parcelas.reduce((t, p) => t + p.valor, 0);
  const titulosIds = new Set(parcelas.map((p) => p.bill_id));
  const base = {
    periodo_de: de,
    periodo_ate: ate,
    titulos: titulosIds.size,
    parcelas: parcelas.length,
    valor: Math.round(total * 100) / 100,
  };
  if (!parcelas.length) {
    return { ...base, prazo_medio: null, prazo_mediano: null, ficha: { sem_historico: true } };
  }

  const porTitulo = new Map();
  parcelas.forEach((p) => {
    if (!porTitulo.has(p.bill_id)) porTitulo.set(p.bill_id, []);
    porTitulo.get(p.bill_id).push(p);
  });
  const padroes = new Map();
  const nParc = new Map();
  const credores = new Map();
  porTitulo.forEach((lista) => {
    lista.sort((a, b) => dia(a.due_date) - dia(b.due_date));
    const n = lista.length;
    const intervalos = lista.slice(1).map((p, i) => dia(p.due_date) - dia(lista[i].due_date));
    let rotulo;
    if (n === 1) rotulo = `1x · ${termo(lista[0].prazo)}`;
    else {
      const primeira = termo(lista[0].prazo);
      rotulo = `${n <= 6 ? n : '7+'}x · ${primeira === 'à vista' ? '1ª à vista' : `1ª em ${primeira}`} · ${frequencia(intervalos)}`;
    }
    const v = lista.reduce((t, p) => t + p.valor, 0);
    const soma = (mapa, chave, extra = {}) => {
      const atual = mapa.get(chave) || { titulos: 0, valor: 0, ...extra };
      atual.titulos += 1;
      atual.valor += v;
      mapa.set(chave, atual);
      return atual;
    };
    soma(padroes, rotulo);
    soma(nParc, n <= 5 ? String(n) : '6+');
    const cred = soma(credores, lista[0].creditor_id ?? 0, { nome: lista[0].creditor_name, padroes: new Map() });
    cred.padroes.set(rotulo, (cred.padroes.get(rotulo) || 0) + v);
  });

  const pct = (v) => um((100 * v) / total);
  const listaPadroes = [...padroes.entries()]
    .map(([padrao, x]) => ({ padrao, titulos: x.titulos, valor: Math.round(x.valor * 100) / 100, pct_valor: pct(x.valor) }))
    .sort((a, b) => b.valor - a.valor);
  const somaPor = (chave) => {
    const m = new Map();
    parcelas.forEach((p) => m.set(chave(p), (m.get(chave(p)) || 0) + p.valor));
    return m;
  };
  const faixas = somaPor((p) => FAIXAS.find(([, a, b]) => p.prazo >= a && p.prazo <= b)[0]);
  const curva = somaPor((p) => (p.mes <= 0 ? 'M0' : p.mes >= 6 ? 'M+6 ou mais' : `M+${p.mes}`));
  const prazoMedio = parcelas.reduce((t, p) => t + p.prazo * p.valor, 0) / total;
  const topo = listaPadroes[0];
  const confianca = topo.pct_valor >= 50 ? 'alta' : topo.pct_valor >= 30 ? 'media' : 'baixa';

  return {
    ...base,
    prazo_medio: um(prazoMedio),
    prazo_mediano: medianaPonderada(parcelas.map((p) => [p.prazo, p.valor])),
    ficha: {
      amostra_pequena: base.titulos < 10,
      confianca,
      sugestao: confianca === 'baixa' ? 'Usar a curva de desembolso' : topo.padrao,
      padroes: listaPadroes.slice(0, 6),
      parcelas_por_titulo: ['1', '2', '3', '4', '5', '6+']
        .filter((k) => nParc.has(k))
        .map((k) => ({
          n: k,
          titulos: nParc.get(k).titulos,
          pct_titulos: um((100 * nParc.get(k).titulos) / base.titulos),
          pct_valor: pct(nParc.get(k).valor),
        })),
      faixas_prazo: FAIXAS.map(([faixa]) => ({ faixa, pct_valor: pct(faixas.get(faixa) || 0) })),
      curva: CURVA.map((mes) => ({ mes, pct_valor: pct(curva.get(mes) || 0) })),
      credores: [...credores.values()]
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 3)
        .map((c) => ({
          nome: c.nome,
          pct_valor: pct(c.valor),
          padrao: [...c.padroes.entries()].sort((a, b) => b[1] - a[1])[0][0],
        })),
    },
  };
}

// Calcula e grava (substitui a anterior).
async function gravar(empresaId, siengeId, usuarioId = null) {
  const f = await calcular(empresaId, siengeId);
  await pool.query(
    `INSERT INTO dfc_desembolso_fichas (empresa_id, sienge_id, periodo_de, periodo_ate, titulos, parcelas, valor,
                                        prazo_medio, prazo_mediano, ficha, usuario_id, calculado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (empresa_id, sienge_id) DO UPDATE SET
       periodo_de = EXCLUDED.periodo_de, periodo_ate = EXCLUDED.periodo_ate, titulos = EXCLUDED.titulos,
       parcelas = EXCLUDED.parcelas, valor = EXCLUDED.valor, prazo_medio = EXCLUDED.prazo_medio,
       prazo_mediano = EXCLUDED.prazo_mediano, ficha = EXCLUDED.ficha, usuario_id = EXCLUDED.usuario_id,
       calculado_em = EXCLUDED.calculado_em`,
    [empresaId, siengeId, f.periodo_de, f.periodo_ate, f.titulos, f.parcelas, f.valor, f.prazo_medio, f.prazo_mediano,
      JSON.stringify(f.ficha), usuarioId, new Date()]
  );
  return obter(empresaId, siengeId);
}

function formatar(r) {
  return {
    sienge_id: r.sienge_id,
    natureza: r.natureza,
    periodo_de: r.periodo_de,
    periodo_ate: r.periodo_ate,
    titulos: r.titulos,
    parcelas: r.parcelas,
    valor: Number(r.valor),
    prazo_medio: r.prazo_medio === null ? null : Number(r.prazo_medio),
    prazo_mediano: r.prazo_mediano,
    ...r.ficha,
    calculado_em: r.calculado_em,
    calculado_por: r.calculado_por,
  };
}

// Ficha guardada de uma natureza (calcula na hora se ainda não tiver).
async function obter(empresaId, siengeId, usuarioId = null) {
  const { rows } = await pool.query(
    `SELECT f.*, p.name AS natureza, u.nome AS calculado_por
       FROM dfc_desembolso_fichas f
       JOIN planos_financeiros_sienge p ON p.empresa_id = f.empresa_id AND p.sienge_id = f.sienge_id
       LEFT JOIN usuarios u ON u.id = f.usuario_id
      WHERE f.empresa_id = $1 AND f.sienge_id = $2`,
    [empresaId, siengeId]
  );
  if (rows[0]) return formatar(rows[0]);
  const { rows: conta } = await pool.query('SELECT 1 FROM planos_financeiros_sienge WHERE empresa_id = $1 AND sienge_id = $2', [
    empresaId,
    siengeId,
  ]);
  if (!conta[0]) throw erro(404, 'Conta não encontrada no plano de contas desta empresa.');
  return gravar(empresaId, siengeId, usuarioId);
}

// Prazo Desembolso de cada natureza com ficha (pra coluna da aba Plano Contas).
async function listar(empresaId) {
  const { rows } = await pool.query(
    `SELECT sienge_id, prazo_medio, prazo_mediano, titulos, calculado_em, (ficha->>'sem_historico')::boolean AS sem_historico
       FROM dfc_desembolso_fichas WHERE empresa_id = $1`,
    [empresaId]
  );
  return rows.map((r) => ({ ...r, prazo_medio: r.prazo_medio === null ? null : Number(r.prazo_medio), sem_historico: Boolean(r.sem_historico) }));
}

// Cria a ficha das naturezas com essa origem (em qualquer plano) que ainda não têm.
async function criarFaltantes(empresaId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT sienge_id FROM (
       SELECT sienge_id FROM dfc_plano_contas WHERE empresa_id = $1 AND origem_projecao = $2
       UNION SELECT sienge_id FROM dfc_plano_contas_centro WHERE empresa_id = $1 AND origem_projecao = $2
     ) x
     WHERE NOT EXISTS (SELECT 1 FROM dfc_desembolso_fichas f WHERE f.empresa_id = $1 AND f.sienge_id = x.sienge_id)`,
    [empresaId, ORIGEM]
  );
  for (const r of rows) await gravar(empresaId, r.sienge_id);
  return rows.length;
}

module.exports = { ORIGEM, calcular, gravar, obter, listar, criarFaltantes };
