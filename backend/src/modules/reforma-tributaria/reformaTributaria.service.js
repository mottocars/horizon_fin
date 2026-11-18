const pool = require('../../config/db');
const projecoes = require('../dre-projecoes/dreProjecoes.service');
const dreMascaras = require('../dre-mascaras/dreMascaras.service');
const { baseDoImposto } = require('../dre-demonstrativo/demonstrativo.service');
const motor = require('./motor');

// Operações > Reforma Tributária. Três abas:
//   Impacto          — a DRE projetada (Projeção da DRE: o rascunho do centro e, sem rascunho, a última
//                      versão salva — a mesma escolha da coluna Projetado da aba DRE de Operações) com a
//                      reforma aplicada a partir de 2027 (motor.js), centro a centro;
//   Centros de Custos — o regime de cada obra (RET de transição ou regime regular) e os dados dele;
//   Alíquotas         — CBS e IBS por ano, redução e redutores dos imóveis, RET de transição.
// Obra sem configuração fica como está (sem impacto): o impacto cresce conforme os centros são configurados.

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
const numOuNulo = (v) => (v === null || v === undefined ? null : Number(v));

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// ---------------------------------------------------------------- Alíquotas

async function lerConfig(empresaId) {
  const { rows } = await pool.query(
    `SELECT aliquotas, reducao_imoveis::float, redutor_residencial::float, redutor_lote::float,
            ret_ibs_cbs::float, ret_irpj_csll::float, c.atualizado_em, u.nome AS usuario
       FROM reforma_tributaria_config c LEFT JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.empresa_id = $1`,
    [empresaId]
  );
  return rows[0] || null;
}

async function obterConfiguracoes(empresaId) {
  const cfg = await lerConfig(empresaId);
  return {
    ...motor.parametros(cfg),
    padrao: !cfg,
    atualizado_em: cfg?.atualizado_em || null,
    usuario: cfg?.usuario || null,
    padroes: motor.PADRAO,
  };
}

async function salvarConfiguracoes(empresaId, dados, usuarioId) {
  const anos = Object.entries(dados.aliquotas || {});
  if (!anos.length) throw erro(400, 'Informe as alíquotas de pelo menos um ano.');
  if (!anos.some(([ano]) => Number(ano) === 2027)) throw erro(400, 'Informe as alíquotas de 2027, o primeiro ano da reforma.');
  await pool.query(
    `INSERT INTO reforma_tributaria_config
       (empresa_id, aliquotas, reducao_imoveis, redutor_residencial, redutor_lote, ret_ibs_cbs, ret_irpj_csll, usuario_id, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (empresa_id) DO UPDATE SET
       aliquotas = EXCLUDED.aliquotas, reducao_imoveis = EXCLUDED.reducao_imoveis,
       redutor_residencial = EXCLUDED.redutor_residencial, redutor_lote = EXCLUDED.redutor_lote,
       ret_ibs_cbs = EXCLUDED.ret_ibs_cbs, ret_irpj_csll = EXCLUDED.ret_irpj_csll,
       usuario_id = EXCLUDED.usuario_id, atualizado_em = EXCLUDED.atualizado_em`,
    [
      empresaId,
      JSON.stringify(Object.fromEntries(anos.map(([ano, a]) => [ano, { cbs: num(a.cbs), ibs: num(a.ibs) }]))),
      dados.reducao_imoveis,
      dados.redutor_residencial,
      dados.redutor_lote,
      dados.ret_ibs_cbs,
      dados.ret_irpj_csll,
      usuarioId,
      new Date(),
    ]
  );
  return obterConfiguracoes(empresaId);
}

async function restaurarConfiguracoes(empresaId) {
  await pool.query('DELETE FROM reforma_tributaria_config WHERE empresa_id = $1', [empresaId]);
  return obterConfiguracoes(empresaId);
}

// ---------------------------------------------------------------- Centros de Custos

// As obras com "Realiza DRE" (na ordem da aba Centros Custos da DRE), com a configuração da reforma e a
// projeção que o Impacto usa (rascunho do centro ou o orçamento da última versão).
async function listarCentros(empresaId) {
  const [{ rows: centros }, { rows: config }, { rows: proj }] = await Promise.all([
    pool.query(
      `SELECT sienge_id::int AS id, name AS nome, NULLIF(TRIM(apelido), '') AS apelido, numero_unidades,
              valor_geral_vendas::float AS vgv, status
         FROM centros_custo_sienge
        WHERE empresa_id = $1 AND realiza_dre AND natureza = 'OBRA'
        ORDER BY dre_ordem ASC NULLS LAST, sienge_id ASC`,
      [empresaId]
    ),
    pool.query(
      `SELECT c.centro_id, c.regime, c.valor_terreno::float, c.unidades_residenciais, c.lotes,
              c.perc_custo_credito::float, c.irpj_csll::float, c.atualizado_em, u.nome AS usuario
         FROM reforma_tributaria_centros c LEFT JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.empresa_id = $1`,
      [empresaId]
    ),
    pool.query(
      `SELECT DISTINCT ON (o.centro_id) o.centro_id, o.versao_id, o.status, v.numero,
              to_char(o.ciclo_inicio, 'YYYY-MM') AS ciclo_inicio, to_char(o.ciclo_fim, 'YYYY-MM') AS ciclo_fim
         FROM dre_projecao_orcamentos o LEFT JOIN dre_projecao_versoes v ON v.id = o.versao_id
        WHERE o.empresa_id = $1
          AND (o.versao_id IS NULL OR o.versao_id = (SELECT id FROM dre_projecao_versoes WHERE empresa_id = $1 ORDER BY numero DESC LIMIT 1))
        ORDER BY o.centro_id, (o.versao_id IS NULL) DESC`,
      [empresaId]
    ),
  ]);
  const cfg = new Map(config.map((c) => [c.centro_id, c]));
  const projecao = new Map(proj.map((p) => [p.centro_id, p]));
  return {
    centros: centros.map((c) => {
      const p = projecao.get(c.id);
      const k = cfg.get(c.id);
      return {
        ...c,
        projecao: p
          ? { origem: p.versao_id ? 'VERSAO' : 'RASCUNHO', numero: p.numero, status: p.status, ciclo_inicio: p.ciclo_inicio, ciclo_fim: p.ciclo_fim }
          : null,
        config: k
          ? {
              regime: k.regime,
              valor_terreno: k.valor_terreno,
              unidades_residenciais: k.unidades_residenciais,
              lotes: k.lotes,
              perc_custo_credito: k.perc_custo_credito,
              irpj_csll: k.irpj_csll,
              atualizado_em: k.atualizado_em,
              usuario: k.usuario,
            }
          : null,
      };
    }),
    irpj_csll_padrao: motor.IRPJ_CSLL_PADRAO,
  };
}

async function salvarCentro(empresaId, centroId, dados, usuarioId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2 AND realiza_dre AND natureza = 'OBRA'`,
    [empresaId, centroId]
  );
  if (!rows[0]) throw erro(404, 'Obra não encontrada (precisa de "Realiza DRE" e natureza Obra).');
  const regular = dados.regime === 'REGULAR';
  if (regular && (dados.valor_terreno === null || dados.perc_custo_credito === null || dados.irpj_csll === null)) {
    throw erro(400, 'No regime regular, informe o valor do terreno, a parte do custo que gera crédito e o IRPJ/CSLL.');
  }
  await pool.query(
    `INSERT INTO reforma_tributaria_centros
       (empresa_id, centro_id, regime, valor_terreno, unidades_residenciais, lotes, perc_custo_credito, irpj_csll, usuario_id, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (empresa_id, centro_id) DO UPDATE SET
       regime = EXCLUDED.regime, valor_terreno = EXCLUDED.valor_terreno,
       unidades_residenciais = EXCLUDED.unidades_residenciais, lotes = EXCLUDED.lotes,
       perc_custo_credito = EXCLUDED.perc_custo_credito, irpj_csll = EXCLUDED.irpj_csll,
       usuario_id = EXCLUDED.usuario_id, atualizado_em = EXCLUDED.atualizado_em`,
    [
      empresaId,
      centroId,
      dados.regime,
      regular ? dados.valor_terreno : null,
      regular ? dados.unidades_residenciais ?? 0 : null,
      regular ? dados.lotes ?? 0 : null,
      regular ? dados.perc_custo_credito : null,
      regular ? dados.irpj_csll : null,
      usuarioId,
      new Date(),
    ]
  );
  return listarCentros(empresaId);
}

async function limparCentro(empresaId, centroId) {
  await pool.query('DELETE FROM reforma_tributaria_centros WHERE empresa_id = $1 AND centro_id = $2', [empresaId, centroId]);
  return listarCentros(empresaId);
}

// ---------------------------------------------------------------- Impacto

const CAMPOS = ['receita', 'imposto_hoje', 'imposto_reforma', 'ibs_cbs', 'irpj_csll', 'credito', 'lucro_hoje', 'lucro_reforma', 'rl_hoje', 'rl_reforma'];
const zerado = () => Object.fromEntries(CAMPOS.map((c) => [c, 0]));
const somarEm = (alvo, x) => CAMPOS.forEach((c) => { alvo[c] += x[c]; });
const r2 = (v) => Math.round(v * 100) / 100;
const arredondar = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v]));

// `centros`: ids (vazio = todos com projeção); `ano`: um ano (vazio = de 2027 ao fim das projeções).
async function impacto(empresaId, { centros: filtro = [], ano = null }) {
  const [fonte, arvore, cfgEmpresa, { rows: cfgCentros }, { rows: cfgDre }, { rows: obras }] = await Promise.all([
    projecoes.orcamentosDaFonte(empresaId, { fonte: 'atual', completo: true }),
    dreMascaras.list(empresaId),
    lerConfig(empresaId),
    pool.query(
      `SELECT centro_id, regime, valor_terreno::float, unidades_residenciais, lotes, perc_custo_credito::float, irpj_csll::float
         FROM reforma_tributaria_centros WHERE empresa_id = $1`,
      [empresaId]
    ),
    pool.query('SELECT poc_receita_mascara_id FROM dre_configuracoes WHERE empresa_id = $1', [empresaId]),
    pool.query(
      `SELECT sienge_id::int AS id, COALESCE(NULLIF(TRIM(apelido), ''), name) AS nome, natureza
         FROM centros_custo_sienge WHERE empresa_id = $1 AND realiza_dre
        ORDER BY dre_ordem ASC NULLS LAST, sienge_id ASC`,
      [empresaId]
    ),
  ]);
  const p = motor.parametros(cfgEmpresa);
  const config = new Map(cfgCentros.map((c) => [c.centro_id, c]));

  // Nível 2 na ordem da DRE; as linhas de imposto fixo e a base delas (a do primeiro imposto).
  const mascaras = arvore.flatMap((g) => g.filhos);
  const iImposto = mascaras.findIndex((m) => m.origem === 'IMPOSTO_FIXO');
  const impostos = mascaras.filter((m) => m.origem === 'IMPOSTO_FIXO');
  const avisos = [...fonte.avisos];
  if (iImposto < 0) {
    return {
      inicio: motor.INICIO,
      anos: [],
      erro: 'A DRE desta empresa não tem linha de imposto sobre a receita (origem Imposto Fixo, como o RET) em Máscaras. Sem ela não há receita de base para a reforma.',
    };
  }
  const impostoIds = impostos.map((m) => m.id);
  const baseIds = baseDoImposto(mascaras, iImposto).map((m) => m.id);
  // Onde o crédito entra: a linha do custo da POC de Receita (o custo das obras, no grupo do CIV).
  const creditoId = cfgDre[0]?.poc_receita_mascara_id || mascaras.find((m) => m.realiza_poc && m.tipo_poc === 'DESPESA')?.id || null;
  const ids2 = mascaras.map((m) => m.id);
  const primeiraTotal = arvore.findIndex((g) => g.totalizadora);

  const pedidos = new Set(filtro.map(Number));
  const nomes = new Map(obras.map((o) => [o.id, o]));
  const comProjecao = fonte.orcamentos.filter((o) => nomes.has(Number(o.centro_id)) && o.mensal?.meses?.length);

  // Os anos disponíveis (2027 até o fim da projeção mais longa).
  const ultimoMes = comProjecao.map((o) => o.mensal.meses[o.mensal.meses.length - 1]).sort().pop() || null;
  const anos = [];
  if (ultimoMes && ultimoMes >= motor.INICIO) {
    for (let a = Number(motor.INICIO.slice(0, 4)); a <= Number(ultimoMes.slice(0, 4)); a += 1) anos.push(a);
  }
  const noPeriodo = (mes) => mes >= motor.INICIO && (!ano || mes.slice(0, 4) === String(ano));

  const valoresHoje = Object.fromEntries(ids2.map((id) => [id, 0]));
  const retFica = Object.fromEntries(impostoIds.map((id) => [id, 0]));
  const total = zerado();
  const porAno = new Map(anos.map((a) => [a, zerado()]));
  const porCentro = [];

  comProjecao
    .filter((o) => !pedidos.size || pedidos.has(Number(o.centro_id)))
    .forEach((orc) => {
      const id = Number(orc.centro_id);
      const obra = nomes.get(id);
      const cfg = obra.natureza === 'OBRA' ? config.get(id) || null : null;
      const r = motor.calcularCentro({
        mensal: orc.mensal,
        poc: orc.resultado?.poc || null,
        impostoIds,
        baseIds,
        parametros: p,
        config: cfg,
      });
      const v = (mid, k) => num(orc.mensal.valores?.[mid]?.[k]);
      const doCentro = zerado();
      r.meses.forEach((m, k) => {
        if (m.mes < motor.INICIO) return;
        const lucroHoje = ids2.reduce((t, mid) => t + v(mid, k), 0);
        const impostoReforma = m.ret + m.ibs_cbs + m.irpj_csll;
        const delta = impostoReforma - m.imposto_hoje + m.credito;
        // Receita Líquida (a 1ª totalizadora): tudo acima dela.
        const rlHoje =
          primeiraTotal > 0 ? arvore.slice(0, primeiraTotal).reduce((t, g) => t + g.filhos.reduce((s, f) => s + v(f.id, k), 0), 0) : 0;
        const impostoAcima = primeiraTotal > 0 && arvore.slice(0, primeiraTotal).some((g) => g.filhos.some((f) => impostoIds.includes(f.id)));
        const x = {
          receita: m.receita,
          imposto_hoje: m.imposto_hoje,
          imposto_reforma: impostoReforma,
          ibs_cbs: m.ibs_cbs,
          irpj_csll: m.irpj_csll,
          credito: m.credito,
          lucro_hoje: lucroHoje,
          lucro_reforma: lucroHoje + delta,
          rl_hoje: rlHoje,
          rl_reforma: rlHoje + (impostoAcima ? impostoReforma - m.imposto_hoje : 0),
        };
        const a = Number(m.mes.slice(0, 4));
        if (porAno.has(a)) somarEm(porAno.get(a), x);
        if (!noPeriodo(m.mes)) return;
        somarEm(doCentro, x);
        ids2.forEach((mid) => { valoresHoje[mid] += v(mid, k); });
        if (!cfg) impostoIds.forEach((mid) => { retFica[mid] += v(mid, k); });
      });
      somarEm(total, doCentro);
      porCentro.push({
        id,
        nome: obra.nome,
        natureza: obra.natureza,
        regime: cfg?.regime || null,
        rho: r.rho,
        redutores: r.redutores,
        receita_total: r.receita_total,
        ciclo_fim: orc.mensal.meses[orc.mensal.meses.length - 1],
        projecao: { origem: orc.origem, status: orc.status },
        ...doCentro,
      });
    });

  // A DRE do período: hoje × com a reforma, no nível 1, abrindo só o que muda (o imposto sobre a receita
  // e o crédito no grupo do custo).
  const valoresReforma = { ...valoresHoje };
  if (impostoIds.length) valoresReforma[impostoIds[0]] += total.imposto_reforma - total.imposto_hoje;
  if (creditoId && valoresReforma[creditoId] !== undefined) valoresReforma[creditoId] += total.credito;
  const n1 = (valores) => {
    let acumulado = 0;
    return arvore.map((g) => {
      if (g.totalizadora) return acumulado;
      const s = g.filhos.reduce((t, f) => t + num(valores[f.id]), 0);
      acumulado += s;
      return s;
    });
  };
  const n1Hoje = n1(valoresHoje);
  const n1Reforma = n1(valoresReforma);
  const dre = [];
  arvore.forEach((g, i) => {
    dre.push({ tipo: g.totalizadora ? 'total' : 'grupo', id: g.id, descricao: g.descricao, hoje: r2(n1Hoje[i]), reforma: r2(n1Reforma[i]) });
    if (g.totalizadora) return;
    g.filhos
      .filter((f) => impostoIds.includes(f.id))
      .forEach((f) => dre.push({ tipo: 'linha', id: f.id, descricao: f.descricao, hoje: r2(valoresHoje[f.id]), reforma: r2(retFica[f.id]) }));
    if (g.filhos.some((f) => impostoIds.includes(f.id))) {
      dre.push({ tipo: 'linha', id: 'ibs_cbs', descricao: 'IBS / CBS', nova: true, hoje: 0, reforma: r2(total.ibs_cbs) });
      dre.push({ tipo: 'linha', id: 'irpj_csll', descricao: 'IRPJ / CSLL', nova: true, hoje: 0, reforma: r2(total.irpj_csll) });
    }
    if (creditoId && g.filhos.some((f) => f.id === creditoId)) {
      const f = g.filhos.find((x) => x.id === creditoId);
      dre.push({ tipo: 'linha', id: f.id, descricao: f.descricao, hoje: r2(valoresHoje[f.id]), reforma: r2(valoresHoje[f.id]) });
      dre.push({ tipo: 'linha', id: 'credito', descricao: 'Crédito de IBS / CBS sobre o custo', nova: true, hoje: 0, reforma: r2(total.credito) });
    }
  });

  const configurados = porCentro.filter((c) => c.regime).length;
  const obrasNoFiltro = porCentro.filter((c) => c.natureza === 'OBRA').length;
  const semProjecao = obras
    .filter((o) => o.natureza === 'OBRA' && !comProjecao.some((x) => Number(x.centro_id) === o.id))
    .filter((o) => !pedidos.size || pedidos.has(o.id))
    .map((o) => ({ id: o.id, nome: o.nome }));

  return {
    inicio: motor.INICIO,
    ano: ano || null,
    anos,
    periodo: { de: ano ? `${ano}-01` : motor.INICIO, ate: ano ? `${ano}-12` : ultimoMes },
    resumo: { ...arredondar(total), configurados, obras: obrasNoFiltro },
    dre,
    por_centro: porCentro.map(arredondar),
    por_ano: [...porAno.entries()].map(([a, x]) => ({ ano: a, ...arredondar(x) })).filter((x) => Math.abs(x.receita) + Math.abs(x.lucro_hoje) > 0.005),
    sem_projecao: semProjecao,
    centros_opcoes: comProjecao.map((o) => ({ id: Number(o.centro_id), nome: nomes.get(Number(o.centro_id)).nome })),
    parametros: p,
    avisos,
  };
}

module.exports = {
  obterConfiguracoes,
  salvarConfiguracoes,
  restaurarConfiguracoes,
  listarCentros,
  salvarCentro,
  limparCentro,
  impacto,
};
