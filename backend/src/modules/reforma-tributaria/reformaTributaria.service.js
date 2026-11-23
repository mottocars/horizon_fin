const pool = require('../../config/db');
const projecoes = require('../dre-projecoes/dreProjecoes.service');
const agrupadores = require('../dre-agrupadores/agrupadores.service');
const dreMascaras = require('../dre-mascaras/dreMascaras.service');
const { baseDoImposto } = require('../dre-demonstrativo/demonstrativo.service');
const dfcOrcamento = require('../dfc-orcamento/dfcOrcamento.service');
const fluxoDfc = require('../dfc-fluxo/fluxo.service');
const motor = require('./motor');
const { comVersaoPublicada } = require('../dre-versoes/contexto');

// A DRE que a Reforma Tributária lê é a PUBLICADA: a última versão salva da DRE (modules/dre-versoes) — o que
// é da DRE (projeção, máscaras, imposto, centros) roda dentro dela (naPublicada); o que é da DFC, ao vivo.
const naPublicada = (fn) => (empresaId, ...args) => comVersaoPublicada(empresaId, () => fn(empresaId, ...args));

// Operações > Reforma Tributária. Abas:
//   Impacto DRE      — a DRE projetada (Projeção da DRE: o rascunho do centro e, sem rascunho, a última
//                      versão salva — a mesma escolha da coluna Projetado da aba DRE de Operações) com a
//                      reforma aplicada a partir de 2027 (motor.js), centro a centro;
//   Centros de Custos — o regime de cada obra (RET de transição ou regime regular) e os dados dele;
//   Impacto DFC      — o fluxo de caixa projetado (última versão do Orçamento do DFC) com o imposto
//                      sobre a receita recalculado pelo caixa nos dois cenários (ver motor.js, DFC);
//   Alíquotas         — CBS e IBS por ano, redução e redutores dos imóveis, RET de transição;
//   Configurações DFC — as contas do DFC (recebimentos de venda, custos com crédito, RET) e o pagamento
//                      do imposto (prazo, split payment, saldo credor).
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
              valor_geral_vendas::float AS vgv, status, realiza_dre, projeta_dfc
         FROM centros_custo_sienge
        WHERE empresa_id = $1 AND (realiza_dre OR projeta_dfc) AND natureza = 'OBRA'
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
      `SELECT DISTINCT ON (o.centro_id) o.centro_id, o.versao_id, o.status, NULL::int AS numero,
              to_char(o.ciclo_inicio, 'YYYY-MM') AS ciclo_inicio, to_char(o.ciclo_fim, 'YYYY-MM') AS ciclo_fim
         FROM dre_projecao_orcamentos o
        WHERE o.empresa_id = $1 AND o.versao_id IS NULL
        ORDER BY o.centro_id`,
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
          ? { origem: 'VERSAO', numero: projecoes.versaoDaDre()?.numero ?? null, status: p.status, ciclo_inicio: p.ciclo_inicio, ciclo_fim: p.ciclo_fim }
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
    `SELECT 1 FROM centros_custo_sienge
      WHERE empresa_id = $1 AND sienge_id = $2 AND (realiza_dre OR projeta_dfc) AND natureza = 'OBRA'`,
    [empresaId, centroId]
  );
  if (!rows[0]) throw erro(404, 'Obra não encontrada (precisa de "Realiza DRE" ou "Projeta DFC" e natureza Obra).');
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
    projecoes.orcamentosDaFonte(empresaId, { completo: true }),
    dreMascaras.list(empresaId),
    lerConfig(empresaId),
    pool.query(
      `SELECT centro_id, regime, valor_terreno::float, unidades_residenciais, lotes, perc_custo_credito::float, irpj_csll::float
         FROM reforma_tributaria_centros WHERE empresa_id = $1`,
      [empresaId]
    ),
    pool.query('SELECT poc_receita_mascara_id FROM dre_configuracoes WHERE empresa_id = $1', [empresaId]),
    // As obras da DRE: um agrupador (dre-agrupadores) é uma obra só, no id do centro principal (o dono da
    // projeção dele) — a configuração da reforma que vale para ele é a do principal.
    agrupadores.unidades(empresaId).then((us) => ({ rows: us.map((u) => ({ id: u.id, nome: u.rotulo, natureza: u.natureza })) })),
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

// ---------------------------------------------------------------- Configurações DFC

// As naturezas do DFC (as que têm Máscara DFC no plano Global ou no de algum centro), com a máscara de
// nível 2, e a sugestão de cada papel pelo nome: recebimentos = máscara de receita de vendas; custos com
// crédito = máscara de custo de construção / obra; RET = natureza com "RET" no nome.
async function contasDfc(empresaId) {
  const { rows } = await pool.query(
    `WITH contas AS (
       SELECT sienge_id, mascara_id, 0 AS prioridade FROM dfc_plano_contas WHERE empresa_id = $1 AND mascara_id IS NOT NULL
       UNION ALL
       SELECT sienge_id, mascara_id, 1 FROM dfc_plano_contas_centro WHERE empresa_id = $1 AND mascara_id IS NOT NULL
     )
     SELECT DISTINCT ON (c.sienge_id) c.sienge_id::int AS id, COALESCE(p.name, 'Natureza ' || c.sienge_id) AS nome,
            m.descricao AS mascara, m.ordem AS m_ordem, g.ordem AS g_ordem
       FROM contas c
       JOIN dfc_mascaras m ON m.id = c.mascara_id
       LEFT JOIN dfc_mascaras g ON g.id = m.parent_id
       LEFT JOIN planos_financeiros_sienge p ON p.empresa_id = $1 AND p.sienge_id = c.sienge_id
      ORDER BY c.sienge_id, c.prioridade`,
    [empresaId]
  );
  const contas = rows.sort((a, b) => (a.g_ordem ?? 0) - (b.g_ordem ?? 0) || (a.m_ordem ?? 0) - (b.m_ordem ?? 0) || a.id - b.id);
  const sem = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const sugestao = {
    contas_receita: contas.filter((c) => /RECEITA.*VENDA|VENDAS?$/.test(sem(c.mascara))).map((c) => c.id),
    contas_custo: contas.filter((c) => /CUSTO.*(CONSTRU|OBRA)/.test(sem(c.mascara))).map((c) => c.id),
    contas_ret: contas.filter((c) => /\bRET\b/.test(sem(c.nome))).map((c) => c.id),
  };
  return { contas: contas.map(({ id, nome, mascara }) => ({ id, nome, mascara })), sugestao };
}

async function lerConfigDfc(empresaId) {
  const { rows } = await pool.query(
    `SELECT contas_receita, contas_custo, contas_ret, prazo_recolhimento, split_inicio, saldo_credor, prazo_ressarcimento,
            c.atualizado_em, u.nome AS usuario
       FROM reforma_tributaria_dfc c LEFT JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.empresa_id = $1`,
    [empresaId]
  );
  return rows[0] || null;
}

// A configuração em vigor: a salva ou, sem nada salvo, o padrão com as contas sugeridas.
async function configDfcEmVigor(empresaId) {
  const [cfg, { contas, sugestao }] = await Promise.all([lerConfigDfc(empresaId), contasDfc(empresaId)]);
  const base = cfg
    ? {
        contas_receita: cfg.contas_receita.map(Number),
        contas_custo: cfg.contas_custo.map(Number),
        contas_ret: cfg.contas_ret.map(Number),
        prazo_recolhimento: cfg.prazo_recolhimento,
        split_inicio: cfg.split_inicio,
        saldo_credor: cfg.saldo_credor,
        prazo_ressarcimento: cfg.prazo_ressarcimento,
      }
    : { ...motor.DFC_PADRAO, ...sugestao };
  return { ...base, padrao: !cfg, atualizado_em: cfg?.atualizado_em || null, usuario: cfg?.usuario || null, contas, sugestao, padroes: motor.DFC_PADRAO };
}

const obterConfigDfc = (empresaId) => configDfcEmVigor(empresaId);

async function salvarConfigDfc(empresaId, dados, usuarioId) {
  if (!dados.contas_receita.length) throw erro(400, 'Escolha pelo menos uma conta de recebimento de venda: é a base do imposto.');
  await pool.query(
    `INSERT INTO reforma_tributaria_dfc
       (empresa_id, contas_receita, contas_custo, contas_ret, prazo_recolhimento, split_inicio, saldo_credor, prazo_ressarcimento, usuario_id, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (empresa_id) DO UPDATE SET
       contas_receita = EXCLUDED.contas_receita, contas_custo = EXCLUDED.contas_custo, contas_ret = EXCLUDED.contas_ret,
       prazo_recolhimento = EXCLUDED.prazo_recolhimento, split_inicio = EXCLUDED.split_inicio,
       saldo_credor = EXCLUDED.saldo_credor, prazo_ressarcimento = EXCLUDED.prazo_ressarcimento,
       usuario_id = EXCLUDED.usuario_id, atualizado_em = EXCLUDED.atualizado_em`,
    [
      empresaId,
      dados.contas_receita,
      dados.contas_custo,
      dados.contas_ret,
      dados.prazo_recolhimento,
      dados.split_inicio,
      dados.saldo_credor,
      dados.prazo_ressarcimento,
      usuarioId,
      new Date(),
    ]
  );
  return configDfcEmVigor(empresaId);
}

async function restaurarConfigDfc(empresaId) {
  await pool.query('DELETE FROM reforma_tributaria_dfc WHERE empresa_id = $1', [empresaId]);
  return configDfcEmVigor(empresaId);
}

// ---------------------------------------------------------------- Impacto DFC

// A receita da obra inteira na Projeção da DRE (a mesma base do ρ do Impacto DRE), por centro.
const receitaTotalDre = naPublicada(receitaTotalDreDaVersao);
async function receitaTotalDreDaVersao(empresaId) {
  const [fonte, arvore] = await Promise.all([projecoes.orcamentosDaFonte(empresaId, {}), dreMascaras.list(empresaId)]);
  const mascaras = arvore.flatMap((g) => g.filhos);
  const i = mascaras.findIndex((m) => m.origem === 'IMPOSTO_FIXO');
  const baseIds = i >= 0 ? baseDoImposto(mascaras, i).map((m) => m.id) : [];
  const total = new Map();
  fonte.orcamentos.forEach((o) => {
    const v = o.mensal?.valores || {};
    total.set(
      Number(o.centro_id),
      baseIds.reduce((t, id) => t + (v[id] || []).reduce((s, x) => s + num(x), 0), 0)
    );
  });
  return total;
}

// A alíquota (%) do RET de hoje num mês: o histórico da linha de imposto fixo da DRE (a vigente no mês);
// sem histórico, a do RET de transição da aba Alíquotas.
const retDeHoje = naPublicada(retDeHojeDaVersao);
async function retDeHojeDaVersao(empresaId, p) {
  const { rows } = await pool.query(
    `SELECT to_char(h.inicio, 'YYYY-MM') AS inicio, h.aliquota::float AS aliquota
       FROM dre_mascaras_imposto_historico h
      WHERE h.mascara_id = (SELECT m.id FROM dre_mascaras m JOIN dre_mascaras g ON g.id = m.parent_id
                             WHERE m.empresa_id = $1 AND m.origem = 'IMPOSTO_FIXO' ORDER BY g.ordem, m.ordem LIMIT 1)
      ORDER BY h.inicio`,
    [empresaId]
  );
  if (!rows.length) return () => p.ret_ibs_cbs + p.ret_irpj_csll;
  return (mes) => rows.filter((h) => h.inicio <= mes).pop()?.aliquota ?? 0;
}

const CAMPOS_DFC = [...motor.CAMPOS_DFC, 'efeito'];
const zeradoDfc = () => Object.fromEntries(CAMPOS_DFC.map((c) => [c, 0]));
const efeitoDe = (x) => x.ret + x.ibs_cbs + x.irpj_csll + x.ressarcimento - x.imposto_hoje;

// `centros`: ids (vazio = todos com valores no DFC de 2027 em diante); `ano`: um ano (vazio = toda a projeção).
async function impactoDfc(empresaId, { centros: filtro = [], ano = null }) {
  const [orc, cls, cfgEmpresa, cfgDfc, { rows: cfgCentros }, { rows: nomesCentros }, receitaDre] = await Promise.all([
    dfcOrcamento.orcamento(empresaId),
    fluxoDfc.classificador(empresaId),
    lerConfig(empresaId),
    configDfcEmVigor(empresaId),
    pool.query(
      `SELECT centro_id, regime, valor_terreno::float, unidades_residenciais, lotes, perc_custo_credito::float, irpj_csll::float
         FROM reforma_tributaria_centros WHERE empresa_id = $1`,
      [empresaId]
    ),
    pool.query(
      `SELECT sienge_id::int AS id, COALESCE(NULLIF(TRIM(apelido), ''), name) AS nome, natureza
         FROM centros_custo_sienge WHERE empresa_id = $1
        ORDER BY dre_ordem ASC NULLS LAST, sienge_id ASC`,
      [empresaId]
    ),
    receitaTotalDre(empresaId),
  ]);
  const p = motor.parametros(cfgEmpresa);
  const retHoje = await retDeHoje(empresaId, p);
  const config = new Map(cfgCentros.map((c) => [c.centro_id, c]));
  const nomes = new Map(nomesCentros.map((c) => [c.id, c]));
  const dfc = {
    prazo_recolhimento: cfgDfc.prazo_recolhimento,
    split_inicio: cfgDfc.split_inicio,
    saldo_credor: cfgDfc.saldo_credor,
    prazo_ressarcimento: cfgDfc.prazo_ressarcimento,
  };
  if (!orc.versao) {
    return { inicio: motor.INICIO, anos: [], erro: 'O DFC desta empresa não tem versão salva do Orçamento. O impacto é calculado sobre ela: salve uma versão em DFC Construtoras › Orçamentos.' };
  }
  const receita = new Set(cfgDfc.contas_receita);
  const custo = new Set(cfgDfc.contas_custo);
  const ret = new Set(cfgDfc.contas_ret);
  // O RET que o DFC já projeta sai a partir do pagamento do primeiro mês da reforma (o de dez/2026, pago
  // em jan/2027 com prazo 1, continua igual nos dois cenários).
  const retSaiDe = motor.somarMeses(motor.INICIO, dfc.prazo_recolhimento);

  // Por centro: recebimentos e pagamentos com crédito por mês (de INICIO em diante), o RET do DFC que
  // sai e a receita total no DFC (ρ de quem não tem Projeção da DRE). Só o que está no fluxo (natureza
  // com Máscara DFC no plano do centro).
  const porCentro = new Map();
  const doCentro = (id) => {
    if (!porCentro.has(id)) porCentro.set(id, { R: new Map(), P: new Map(), retDfc: new Map(), receitaTotal: 0 });
    return porCentro.get(id);
  };
  let ultimoDfc = null;
  orc.valores.forEach((v) => {
    const c = cls.classificar(v.centro_id, v.sienge_id);
    if (!c) return;
    const valor = num(v.valor);
    const x = doCentro(Number(v.centro_id));
    if (receita.has(Number(v.sienge_id))) x.receitaTotal += valor;
    if (v.mes < motor.INICIO) return;
    if (!ultimoDfc || v.mes > ultimoDfc) ultimoDfc = v.mes;
    if (receita.has(Number(v.sienge_id))) x.R.set(v.mes, (x.R.get(v.mes) || 0) + valor);
    if (custo.has(Number(v.sienge_id))) x.P.set(v.mes, (x.P.get(v.mes) || 0) - valor);
    if (ret.has(Number(v.sienge_id)) && v.mes >= retSaiDe) x.retDfc.set(v.mes, (x.retDfc.get(v.mes) || 0) + valor);
  });
  if (!ultimoDfc) {
    return { inicio: motor.INICIO, anos: [], erro: 'O Orçamento do DFC não tem valores de 2027 em diante: não há o que comparar.' };
  }
  const mesesFato = [];
  for (let m = motor.INICIO; m <= ultimoDfc; m = motor.somarMeses(m, 1)) mesesFato.push(m);
  const positivo = (mapa) => new Map([...mapa].map(([m, v]) => [m, Math.max(0, v)]));

  const pedidos = new Set(filtro.map(Number));
  const opcoes = [...porCentro.keys()]
    .filter((id) => porCentro.get(id).R.size || porCentro.get(id).P.size || porCentro.get(id).retDfc.size)
    .map((id) => ({ id, nome: nomes.get(id)?.nome || `Centro ${id}` }));
  const escolhidos = [...porCentro.keys()].filter((id) => !pedidos.size || pedidos.has(id));

  const centrosCalc = escolhidos.map((id) => {
    const x = porCentro.get(id);
    const obra = nomes.get(id);
    const cfg = obra?.natureza === 'OBRA' ? config.get(id) || null : null;
    const receitaObra = receitaDre.get(id) || x.receitaTotal;
    const rho = cfg?.regime === 'REGULAR' && receitaObra > 0 ? Math.min(1, Math.max(0, motor.redutores(p, cfg) / receitaObra)) : 0;
    const r = motor.calcularCentroDfc({ meses: mesesFato, recebimentos: positivo(x.R), pagamentos: positivo(x.P), retHoje, parametros: p, config: cfg, rho, dfc });
    return { id, nome: obra?.nome || `Centro ${id}`, natureza: obra?.natureza || null, regime: cfg?.regime || null, rho, r, retDfc: x.retDfc };
  });

  // Meses de caixa: de INICIO até o último mês com recebimento, pagamento com crédito ou imposto (um título
  // perdido com vencimento em 2050 não estica o período).
  const ativo = (m) => motor.CAMPOS_DFC.some((k) => Math.abs(m[k]) > 0.005);
  const ultimoCaixa = centrosCalc.reduce(
    (u, c) => c.r.meses.reduce((v, m) => (ativo(m) && m.mes > v ? m.mes : v), u),
    centrosCalc.reduce((u, c) => [...c.retDfc.keys()].reduce((v, m) => (m > v ? m : v), u), motor.INICIO)
  );
  const mesesCaixa = [];
  for (let m = motor.INICIO; m <= ultimoCaixa; m = motor.somarMeses(m, 1)) mesesCaixa.push(m);
  const noPeriodo = (mes) => !ano || mes.slice(0, 4) === String(ano);

  // O DFC de hoje (mesmo fluxo da aba DFC, com os centros do filtro): saldos e o nível 1 por mês.
  const mesAtual = fluxoDfc.mesDeHoje();
  const fluxo = await fluxoDfc.montar(empresaId, {
    inicio: mesAtual < motor.INICIO ? mesAtual : motor.INICIO,
    fim: ultimoCaixa,
    centros: pedidos.size ? (escolhidos.length ? escolhidos : [-1]) : [],
  });
  // Saldo final do DFC de hoje no mês (o fluxo monta no máximo 240 meses: depois, repete o último).
  let ultimoSaldo = 0;
  const saldoDfc = (mes) => {
    const v = fluxo.porColuna.saldoFinal[`${mes}|P`] ?? fluxo.porColuna.saldoFinal[`${mes}|R`];
    if (v !== undefined && v !== null) ultimoSaldo = v;
    return ultimoSaldo;
  };

  // Série mensal consolidada (centros do filtro).
  const serie = new Map(mesesCaixa.map((m) => [m, { ...zeradoDfc(), ret_dfc: 0 }]));
  centrosCalc.forEach((c) => {
    c.r.meses.forEach((m) => {
      const s = serie.get(m.mes);
      if (!s) return;
      motor.CAMPOS_DFC.forEach((k) => { s[k] += m[k]; });
    });
    c.retDfc.forEach((v, mes) => {
      if (serie.has(mes)) serie.get(mes).ret_dfc += v;
    });
  });
  let acumImposto = 0;
  let acumEfeito = 0;
  let acumRetDfc = 0;
  const mensal = mesesCaixa.map((mes) => {
    const s = serie.get(mes);
    s.efeito = efeitoDe(s);
    acumImposto += s.imposto_hoje;
    acumEfeito += s.efeito;
    acumRetDfc += s.ret_dfc;
    const saldoHoje = saldoDfc(mes) - acumRetDfc + acumImposto;
    return { mes, ...s, saldo_hoje: saldoHoje, saldo_reforma: saldoHoje + acumEfeito };
  });
  const doPeriodo = mensal.filter((m) => noPeriodo(m.mes));
  const total = zeradoDfc();
  let retDfcPeriodo = 0;
  doPeriodo.forEach((m) => {
    CAMPOS_DFC.forEach((k) => { total[k] += m[k]; });
    retDfcPeriodo += m.ret_dfc;
  });
  const menor = (campo) => doPeriodo.reduce((a, m) => (!a || m[campo] < a.valor ? { valor: m[campo], mes: m.mes } : a), null);

  // Linhas da tabela: os meses do ano escolhido ou, sem ano, um por ano (saldo no fim do ano).
  let linhas;
  if (ano) linhas = doPeriodo.map((m) => ({ periodo: m.mes, ...arredondar(m) }));
  else {
    const anos = new Map();
    doPeriodo.forEach((m) => {
      const a = m.mes.slice(0, 4);
      if (!anos.has(a)) anos.set(a, { ...zeradoDfc() });
      const t = anos.get(a);
      CAMPOS_DFC.forEach((k) => { t[k] += m[k]; });
      t.saldo_hoje = m.saldo_hoje;
      t.saldo_reforma = m.saldo_reforma;
    });
    linhas = [...anos.entries()].map(([a, t]) => ({ periodo: a, ...arredondar(t) }));
  }

  // O DFC do período no nível 1: hoje (com o RET recalculado no lugar do projetado) × com a reforma.
  const n1DoRet = (() => {
    for (const c of centrosCalc) for (const [mes] of c.retDfc) {
      const v = orc.valores.find((x) => Number(x.centro_id) === c.id && x.mes === mes && ret.has(Number(x.sienge_id)));
      const k = v && cls.classificar(v.centro_id, v.sienge_id);
      if (k) return k.n1;
    }
    const g = cfgDfc.contas_ret.map((id) => cls.classificar(null, id) || cls.classificar(escolhidos[0], id)).find(Boolean);
    return g?.n1 ?? cls.mascaras[0]?.id ?? null;
  })();
  const retDfcPorN1 = new Map();
  centrosCalc.forEach((c) =>
    c.retDfc.forEach((v, mes) => {
      if (!noPeriodo(mes)) return;
      const val = orc.valores.find((x) => Number(x.centro_id) === c.id && x.mes === mes && ret.has(Number(x.sienge_id)));
      const k = val && cls.classificar(val.centro_id, val.sienge_id);
      const n1 = k?.n1 ?? n1DoRet;
      retDfcPorN1.set(n1, (retDfcPorN1.get(n1) || 0) + v);
    })
  );
  const somaPeriodo = (porColuna) => doPeriodo.reduce((t, m) => t + num(porColuna?.[`${m.mes}|P`]), 0);
  const estrutura = new Map(fluxo.estrutura.map((g) => [g.id, g]));
  const dfcLinhas = [];
  let resultadoHoje = 0;
  let resultadoReforma = 0;
  cls.mascaras.forEach((g) => {
    const doDfc = somaPeriodo(estrutura.get(g.id)?.porColuna);
    const temRet = g.id === n1DoRet;
    if (!estrutura.has(g.id) && !temRet) return;
    const hoje = doDfc - (retDfcPorN1.get(g.id) || 0) + (temRet ? total.imposto_hoje : 0);
    const reforma = hoje + (temRet ? total.efeito : 0);
    resultadoHoje += hoje;
    resultadoReforma += reforma;
    dfcLinhas.push({ tipo: 'grupo', id: g.id, descricao: g.descricao, hoje: r2(hoje), reforma: r2(reforma) });
    if (temRet) {
      dfcLinhas.push({ tipo: 'linha', id: 'ret', descricao: 'Imposto sobre a receita hoje (RET)', hoje: r2(total.imposto_hoje), reforma: r2(total.ret) });
      dfcLinhas.push({ tipo: 'linha', id: 'ibs_cbs', descricao: 'IBS / CBS', nova: true, hoje: 0, reforma: r2(total.ibs_cbs) });
      dfcLinhas.push({ tipo: 'linha', id: 'irpj_csll', descricao: 'IRPJ / CSLL', nova: true, hoje: 0, reforma: r2(total.irpj_csll) });
      dfcLinhas.push({ tipo: 'linha', id: 'ressarcimento', descricao: 'Ressarcimento de crédito', nova: true, hoje: 0, reforma: r2(total.ressarcimento) });
    }
  });
  const ultimoDoPeriodo = doPeriodo[doPeriodo.length - 1];
  dfcLinhas.push({ tipo: 'total', id: 'resultado', descricao: 'Resultado do período', hoje: r2(resultadoHoje), reforma: r2(resultadoReforma) });
  if (ultimoDoPeriodo) {
    dfcLinhas.push({
      tipo: 'total',
      id: 'saldo',
      descricao: 'Saldo final',
      hoje: r2(ultimoDoPeriodo.saldo_hoje),
      reforma: r2(ultimoDoPeriodo.saldo_reforma),
    });
  }

  const anosDisp = [...new Set(mesesCaixa.map((m) => Number(m.slice(0, 4))))];
  const menorHoje = menor('saldo_hoje');
  const menorReforma = menor('saldo_reforma');
  return {
    inicio: motor.INICIO,
    ano: ano || null,
    anos: anosDisp,
    periodo: { de: doPeriodo[0]?.mes || null, ate: ultimoDoPeriodo?.mes || null },
    versao: { numero: orc.versao.numero, criado_em: orc.versao.criado_em },
    resumo: {
      ...arredondar(total),
      ret_dfc: r2(retDfcPeriodo),
      menor_saldo_hoje: menorHoje && { valor: r2(menorHoje.valor), mes: menorHoje.mes },
      menor_saldo_reforma: menorReforma && { valor: r2(menorReforma.valor), mes: menorReforma.mes },
      configurados: centrosCalc.filter((c) => c.regime).length,
      obras: centrosCalc.filter((c) => c.natureza === 'OBRA').length,
    },
    dfc: dfcLinhas,
    linhas,
    por_centro: centrosCalc
      .map((c) => {
        const t = zeradoDfc();
        c.r.meses.filter((m) => noPeriodo(m.mes)).forEach((m) => {
          motor.CAMPOS_DFC.forEach((k) => { t[k] += m[k]; });
        });
        t.efeito = efeitoDe(t);
        return {
          id: c.id,
          nome: c.nome,
          natureza: c.natureza,
          regime: c.regime,
          rho: c.rho,
          saldo_credor_final: r2(c.r.saldo_credor_final),
          ...arredondar(t),
        };
      })
      .filter((c) => Math.abs(c.recebimentos) + Math.abs(c.pagamentos) + Math.abs(c.imposto_hoje) > 0.005),
    parametros: { ...dfc, ret_hoje: retHoje(motor.INICIO) },
    centros_opcoes: opcoes,
    contas: { receita: cfgDfc.contas_receita.length, custo: cfgDfc.contas_custo.length, ret: cfgDfc.contas_ret.length, padrao: cfgDfc.padrao },
  };
}

module.exports = {
  obterConfigDfc,
  salvarConfigDfc,
  restaurarConfigDfc,
  impactoDfc,
  obterConfiguracoes,
  salvarConfiguracoes,
  restaurarConfiguracoes,
  listarCentros: naPublicada(listarCentros),
  salvarCentro,
  limparCentro,
  impacto: naPublicada(impacto),
};
