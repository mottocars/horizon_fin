const pool = require('../../config/db');
const demonstrativo = require('../dre-demonstrativo/demonstrativo.service');
const financeiro = require('../dre-financeiro/financeiro.service');
const planoContas = require('../dre-plano-contas/drePlanoContas.service');
const dreMascaras = require('../dre-mascaras/dreMascaras.service');
const unidadesService = require('../dre-unidades/unidades.service');

// Projeção da DRE (aba Projeções da DRE Construtoras) — o cálculo. Usa o MESMO motor da DRE realizada
// (demonstrativo.service.js: carregar + construir + calcular), só trocando o que vem depois da trava:
//   - realizado: tudo com data até o fim do mês da trava (contratos, distratos, permutas, correção
//     monetária pelo vencimento, lançamentos do Financeiro pela emissão / data) — igual à DRE de hoje;
//   - projetado, do mês seguinte à trava até o fim do ciclo:
//       vendas      — as unidades disponíveis na trava com mês de venda (valor informado, ou o ticket
//                     médio do tipo), cada uma com a fração ideal inteira;
//       naturezas   — das máscaras que calculam pelo Financeiro, pela Origem Projeção do plano de contas
//                     do centro: HORIZON - INFORMADO (digitado), SIENGE - EMPRESARIAL (orçamento
//                     empresarial do Sienge, última versão, no mês orçado — sem o prazo de desembolso
//                     da DFC; saída negativa), SIENGE - AGING (títulos do Sienge pela emissão), NÃO
//                     POSSUI ORIGEM (nada);
//       correção    — a correção monetária digitada mês a mês.
// Daí o motor acumula, aplica as POCs e reconhece como na DRE realizada (Estorno de Receita / Custo,
// Receita com Permuta, Receita com Distratos e RET saem sozinhos). Distratos futuros não são projetados.

const ORIGEM = {
  NAO_POSSUI: 'NAO_POSSUI',
  INFORMADO: 'HORIZON_ORCAMENTO_INFORMADO',
  EMPRESARIAL: 'SIENGE_ORCAMENTO_EMPRESARIAL',
  AGING: 'SIENGE_AGING',
};

const { fimDoMes } = demonstrativo;
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// 'AAAA-MM' + k meses.
function somarMeses(anoMes, k) {
  const [a, m] = anoMes.split('-').map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

// 'AAAA-MM' de `de` até `ate`, inclusive (no máximo 360).
function mesesEntre(de, ate) {
  const lista = [];
  for (let m = de; m <= ate && lista.length < 360; m = somarMeses(m, 1)) lista.push(m);
  return lista;
}

// Mês de hoje no horário de Brasília (o relógio do Postgres da VPS é deslocado).
const mesAtual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
const fimMes = (anoMes) => fimDoMes(`${anoMes}-01`);

// Ciclo, trava e meses projetados de um orçamento. Sem trava definida (centro sem histórico), o
// realizado acaba no mês antes do início do ciclo.
function janela(orc) {
  const trava = orc.trava || somarMeses(orc.ciclo_inicio, -1);
  const inicioProjecao = somarMeses(trava, 1);
  return {
    cicloInicio: orc.ciclo_inicio,
    cicloFim: orc.ciclo_fim,
    trava,
    travaFim: fimMes(trava),
    inicioProjecao,
    meses: inicioProjecao <= orc.ciclo_fim ? mesesEntre(inicioProjecao, orc.ciclo_fim) : [],
  };
}

async function centroDe(empresaId, centroId) {
  const { rows } = await pool.query(
    `SELECT sienge_id::int AS id, name AS nome, NULLIF(TRIM(apelido), '') AS apelido, natureza, realiza_dre
       FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2`,
    [empresaId, centroId]
  );
  if (!rows[0]) throw erro(404, 'Centro de custo não encontrado.');
  return rows[0];
}

// ---------------------------------------------------------------- unidades

// Unidade do contrato sem cadastro em sie_units: pelo nome (mesma chave do rastreio da POC).
const chaveUnidade = (r) => (r.unit_id !== null && r.unit_id !== undefined ? `u${r.unit_id}` : `n${r.unidade}`);

// Unidades disponíveis NA TRAVA (as que a projeção pode vender), a partir da análise da aba Unidades
// (`c` = o centro de unidades.listar): todas as unidades conhecidas menos as ocupadas no fim do mês da
// trava — contrato assinado até lá e não distratado até lá, ou permuta. Assim entram também as vendidas
// depois da trava (com a venda registrada como sugestão: mês e valor do contrato) e as distratadas que
// voltaram ao estoque. Ticket médio do tipo = média dos contratos não cancelados do mesmo tipo no
// empreendimento (a regra da aba Unidades).
function unidadesNaTrava(c, travaFim) {
  const { vendidas, distratadas, permuta, disponiveis } = c.clusters;
  const distratoEm = new Map(distratadas.map((d) => [d.chave.slice(1), d.data]));
  const ativaNaTrava = (v) => {
    if (!v.data || v.data > travaFim) return false;
    const dd = distratoEm.get(v.chave.slice(1));
    return !(dd && dd <= travaFim);
  };
  const ocupadas = new Set([...vendidas.filter(ativaNaTrava).map(chaveUnidade), ...permuta.map(chaveUnidade)]);

  const somaTicket = new Map();
  vendidas
    .filter((v) => !v.contrato?.cancelado && v.valor !== null && v.valor !== undefined)
    .forEach((v) => {
      const t = somaTicket.get(v.tipo) || { soma: 0, n: 0 };
      somaTicket.set(v.tipo, { soma: t.soma + Number(v.valor), n: t.n + 1 });
    });

  const todas = new Map();
  [...disponiveis, ...vendidas, ...distratadas, ...permuta].forEach((u) => {
    const k = chaveUnidade(u);
    if (!todas.has(k)) {
      todas.set(k, { chave: k, unit_id: u.unit_id ?? null, unidade: u.unidade, tipo: u.tipo, fracao_ideal: u.fracao_ideal });
    }
  });
  const depois = new Map();
  [...vendidas]
    .filter((v) => v.data && v.data > travaFim)
    .sort((a, b) => a.data.localeCompare(b.data))
    .forEach((v) => {
      const k = chaveUnidade(v);
      if (!depois.has(k)) depois.set(k, { mes: v.data.slice(0, 7), valor: v.valor === null ? null : Number(v.valor) });
    });

  return [...todas.values()]
    .filter((u) => !ocupadas.has(u.chave))
    .map((u) => {
      const t = somaTicket.get(u.tipo);
      return { ...u, ticket: t ? Math.round((t.soma / t.n) * 100) / 100 : null, venda_registrada: depois.get(u.chave) || null };
    })
    .sort((a, b) => (a.unidade || '').localeCompare(b.unidade || '', 'pt-BR', { numeric: true }));
}

// Mês e valor de venda que valem pra uma unidade: o informado no rascunho; sem nada informado, a venda
// registrada depois da trava (se houver). Valor vazio = o da venda registrada, senão o ticket médio.
function vendaDaUnidade(u, dados) {
  const e = dados?.unidades?.[u.chave];
  const mes = e ? e.mes || null : u.venda_registrada?.mes || null;
  const informado = e && e.valor !== null && e.valor !== undefined && e.valor !== '' ? Number(e.valor) : null;
  const valor = informado ?? u.venda_registrada?.valor ?? u.ticket ?? 0;
  return { mes, valor };
}

async function unidades(empresaId, orc) {
  const j = janela(orc);
  const centro = await centroDe(empresaId, orc.centro_id);
  if (centro.natureza !== 'OBRA') return { meses: j.meses, unidades: [] };
  const { centros } = await unidadesService.listar(empresaId);
  const c = centros.find((x) => x.id === orc.centro_id);
  return { meses: j.meses, unidades: c ? unidadesNaTrava(c, j.travaFim) : [] };
}

// ---------------------------------------------------------------- naturezas

// Papel de cada máscara de nível 2 na projeção: `poc` (etapa POC — as do Financeiro com % POC e a
// máscara do custo da POC de Receita), `demais` (as do Financeiro sem POC) e a Correção Monetária (vai
// pra etapa POC se tiver % POC). O resto (contratos, unidades, estornos, imposto) é calculado.
function papeis(mascaras, cfg) {
  const r = demonstrativo.regras(mascaras, cfg);
  const financeiro = new Set(r.idsFinanceiro);
  const ehPoc = (m) => financeiro.has(m.id) && (m.realiza_poc || (r.mascaraPoc && m.id === r.mascaraPoc.id));
  return {
    regras: r,
    financeiro,
    etapaDe: (m) => {
      if (m.calculo === 'CORRECAO_MONETARIA') return m.realiza_poc ? 'poc' : 'demais';
      if (!financeiro.has(m.id)) return null;
      return ehPoc(m) ? 'poc' : 'demais';
    },
  };
}

// Orçamento empresarial do Sienge do centro (última versão de cada orçamento, linhas analíticas), por
// natureza e mês orçado, de `de` a `ate` ('AAAA-MM'), negativo (é custo).
async function empresarialDoCentro(empresaId, centroId, de, ate) {
  const { rows } = await pool.query(
    `WITH ultima AS (
       SELECT DISTINCT ON (b.id) b.registro_id
         FROM sie_business_budget b
        WHERE b.empresa_id = $1 AND b.cost_center_id = $2
        ORDER BY b.id, b.version_number DESC NULLS LAST, b.registro_id DESC
     )
     SELECT c.id::text AS natureza_id, to_char(v.mes, 'YYYY-MM') AS mes, SUM(v.total_price) AS valor
       FROM ultima u
       JOIN sie_business_budget_categorias c ON c.registro_id = u.registro_id
       JOIN sie_business_budget_valores v ON v.categoria_id = c.categoria_id
      WHERE v.mes >= $3::date AND v.mes <= $4::date AND COALESCE(c.type, '') <> 'T' AND COALESCE(v.total_price, 0) <> 0
      GROUP BY 1, 2`,
    [empresaId, centroId, `${de}-01`, `${ate}-01`]
  );
  return rows.map((r) => ({ natureza_id: r.natureza_id, mes: r.mes, valor: -num(r.valor) }));
}

// Valores das naturezas projetadas de um centro, de cada origem, nos meses projetados:
// [{ natureza_id, nome, mascara_id, origem, editavel, valores: { mes: valor } }] (as INFORMADO com o
// digitado no rascunho) e quantas naturezas das máscaras projetadas estão sem Origem Projeção.
async function naturezasProjetadas(empresaId, orc, { mascarasAlvo, plano, j }) {
  const contas = plano.contas.filter((c) => !c.nao_entra && c.mascara_id && mascarasAlvo.has(c.mascara_id));
  const semOrigem = contas.filter((c) => !c.origem_projecao).length;
  const ativas = contas.filter((c) => c.origem_projecao && c.origem_projecao !== ORIGEM.NAO_POSSUI);
  const temEmpresarial = ativas.some((c) => c.origem_projecao === ORIGEM.EMPRESARIAL);
  const temAging = ativas.some((c) => c.origem_projecao === ORIGEM.AGING);
  const vazio = !j.meses.length;
  const [empresarial, aging] = await Promise.all([
    temEmpresarial && !vazio ? empresarialDoCentro(empresaId, orc.centro_id, j.inicioProjecao, j.cicloFim) : [],
    temAging && !vazio
      ? financeiro.titulosPorNaturezaMes(empresaId, orc.centro_id, `${j.inicioProjecao}-01`, fimMes(j.cicloFim))
      : [],
  ]);
  const porNatureza = (lista) => {
    const m = new Map();
    lista.forEach((r) => {
      if (!m.has(r.natureza_id)) m.set(r.natureza_id, {});
      const x = m.get(r.natureza_id);
      x[r.mes] = (x[r.mes] || 0) + r.valor;
    });
    return m;
  };
  const doEmpresarial = porNatureza(empresarial);
  const doAging = porNatureza(aging);
  const meses = new Set(j.meses);
  const digitado = (natureza) => {
    const v = orc.dados?.valores?.[natureza] || {};
    return Object.fromEntries(Object.entries(v).filter(([mes, x]) => meses.has(mes) && num(x) !== 0).map(([mes, x]) => [mes, num(x)]));
  };
  const naturezas = ativas.map((c) => {
    const valores =
      c.origem_projecao === ORIGEM.INFORMADO
        ? digitado(c.natureza_id)
        : c.origem_projecao === ORIGEM.EMPRESARIAL
          ? doEmpresarial.get(c.natureza_id) || {}
          : doAging.get(c.natureza_id) || {};
    return {
      natureza_id: c.natureza_id,
      nome: c.nome,
      mascara_id: c.mascara_id,
      origem: c.origem_projecao,
      editavel: c.origem_projecao === ORIGEM.INFORMADO,
      valores,
    };
  });
  return { naturezas, semOrigem };
}

// Etapa de digitação ('poc' ou 'demais'): as máscaras da etapa, na ordem da DRE, com as naturezas
// (drilldown) — a Correção Monetária é uma linha só, digitada direto. Na etapa POC, também o resumo da
// obra no realizado: orçamento vigente no fim do ciclo, custo acumulado e POCs na trava.
async function contas(empresaId, orc, etapa) {
  const j = janela(orc);
  const [centro, d, plano] = await Promise.all([
    centroDe(empresaId, orc.centro_id),
    demonstrativo.carregar(empresaId, { ate: j.travaFim, ateOrcamento: fimMes(j.cicloFim), filtro: [orc.centro_id] }),
    planoContas.planoDoCentro(empresaId, orc.centro_id),
  ]);
  const obra = centro.natureza === 'OBRA';
  const p = papeis(d.mascaras, d.cfg);
  const pais = new Map((await dreMascaras.list(empresaId)).map((g) => [g.id, g.descricao]));
  // Centro administrativo não tem POC: só as máscaras sem POC.
  const daEtapa = d.mascaras.filter((m) => p.etapaDe(m) === etapa && (obra || etapa === 'demais'));
  const alvo = new Set(daEtapa.filter((m) => m.calculo !== 'CORRECAO_MONETARIA').map((m) => m.id));
  const { naturezas, semOrigem } = await naturezasProjetadas(empresaId, orc, { mascarasAlvo: alvo, plano, j });
  const grupos = daEtapa.map((m) => ({
    mascara_id: m.id,
    descricao: m.descricao,
    grupo: pais.get(m.parent_id) || null,
    poc: m.realiza_poc ? m.tipo_poc : null,
    custo_obra: Boolean(p.regras.mascaraPoc && p.regras.mascaraPoc.id === m.id),
    correcao: m.calculo === 'CORRECAO_MONETARIA',
    naturezas: naturezas.filter((n) => n.mascara_id === m.id),
  }));

  let resumo = null;
  if (etapa === 'poc' && obra) {
    const motor = demonstrativo.construir(d);
    const id = orc.centro_id;
    const fimCiclo = fimMes(j.cicloFim);
    resumo = {
      mascara_custo: p.regras.mascaraPoc,
      orcamento: motor.pocEm ? motor.pocEm(id, fimCiclo).orcamento : null,
      custo_realizado: motor.pocEm ? motor.pocEm(id, j.travaFim).custo : null,
      poc_receita_trava: motor.pocEm ? motor.pocEm(id, j.travaFim).poc : null,
      poc_despesa_trava: motor.pocDespesa(id, j.travaFim),
    };
  }
  return { meses: j.meses, trava: j.trava, grupos, sem_origem: semOrigem, resumo };
}

// ---------------------------------------------------------------- cálculo

// Nível 1 a partir dos valores do nível 2: grupo = soma das linhas dele; totalizadora = soma de todas
// as linhas de nível 2 acima dela (a regra da aba DRE). Linha sem cálculo (null) conta como zero.
function totaisNivel1(arvore, valores) {
  let acumulado = 0;
  return arvore.map((g) => {
    if (g.totalizadora) return { id: g.id, valor: acumulado };
    const v = g.filhos.reduce((t, f) => t + num(valores[f.id]), 0);
    acumulado += v;
    return { id: g.id, valor: v };
  });
}

// Soma dos valores de vários meses, máscara a máscara (null fica null só se for null em todos).
function somaDosMeses(listaValores, ids) {
  const out = {};
  ids.forEach((id) => {
    const vs = listaValores.map((v) => v?.[id]);
    out[id] = vs.every((x) => x === null || x === undefined) ? (vs.length ? null : 0) : vs.reduce((t, x) => t + num(x), 0);
  });
  return out;
}

// O motor da DRE do orçamento: o realizado até a trava (o de HOJE, lido do banco) + as premissas
// projetadas depois dela. Sem `foto`, as premissas saem do que foi informado e das origens agora (vendas
// das unidades, naturezas pela Origem Projeção — o empresarial e os títulos do Sienge de hoje —, correção
// digitada); com `foto` (o `resultado` gravado ao concluir), as premissas são as da foto: é assim que a
// auditoria (Excel, MCP) refaz a conta de uma versão salva — qualquer diferença com a foto vem do
// realizado até a trava, que mudou depois (lançamento novo com data antiga, ajuste, contrato).
async function prepararMotor(empresaId, orc, { foto = null } = {}) {
  const j = janela(orc);
  if (!j.meses.length) throw erro(400, 'O fim do ciclo precisa ser depois do mês da trava.');
  const usarFoto = Boolean(foto && Array.isArray(foto.vendas) && Array.isArray(foto.naturezas));
  const [centro, d, plano] = await Promise.all([
    centroDe(empresaId, orc.centro_id),
    demonstrativo.carregar(empresaId, { ate: j.travaFim, ateOrcamento: fimMes(j.cicloFim), filtro: [orc.centro_id] }),
    usarFoto ? null : planoContas.planoDoCentro(empresaId, orc.centro_id),
  ]);
  if (!centro.realiza_dre) throw erro(400, `${centro.nome} não está com "Realiza DRE" marcado.`);
  const id = orc.centro_id;
  const obra = centro.natureza === 'OBRA';
  const p = papeis(d.mascaras, d.cfg);
  const meses = new Set(j.meses);

  // Vendas projetadas (só obra).
  const c = d.unidadesCentros.find((x) => x.id === id);
  const vendas = usarFoto
    ? foto.vendas.filter((v) => v.mes && meses.has(v.mes)).map((v) => ({ ...v, fracao_ideal: num(v.fracao_ideal), valor: num(v.valor) }))
    : (obra && c ? unidadesNaTrava(c, j.travaFim) : [])
        .map((u) => ({ u, ...vendaDaUnidade(u, orc.dados) }))
        .filter((x) => x.mes && meses.has(x.mes))
        .map(({ u, mes, valor }) => ({ chave: u.chave, unidade: u.unidade, tipo: u.tipo, fracao_ideal: num(u.fracao_ideal), mes, valor }));
  const cortado = c
    ? {
        ...c,
        clusters: {
          ...c.clusters,
          vendidas: [
            ...c.clusters.vendidas.filter((v) => v.data && v.data <= j.travaFim),
            ...vendas.map((v) => ({
              chave: `p${v.chave}`,
              unidade: v.unidade,
              tipo: v.tipo,
              fracao_ideal: v.fracao_ideal,
              participacao: 1,
              data: `${v.mes}-01`,
              valor: v.valor,
              contrato: { cancelado: false },
            })),
          ],
          distratadas: c.clusters.distratadas.filter((x) => x.data && x.data <= j.travaFim),
          permuta: c.clusters.permuta.filter((x) => !x.data || x.data <= j.travaFim),
        },
      }
    : null;

  // Naturezas projetadas (só as máscaras de cada etapa que valem pro centro).
  const alvo = new Set(
    d.mascaras
      .filter((m) => m.calculo !== 'CORRECAO_MONETARIA' && p.etapaDe(m) && (obra || p.etapaDe(m) === 'demais'))
      .map((m) => m.id)
  );
  const naturezas = usarFoto
    ? foto.naturezas
        .filter((n) => alvo.has(n.mascara_id))
        .map((n) => ({
          ...n,
          valores: Object.fromEntries(Object.entries(n.valores || {}).filter(([mes, v]) => meses.has(mes) && num(v) !== 0).map(([mes, v]) => [mes, num(v)])),
        }))
    : (await naturezasProjetadas(empresaId, orc, { mascarasAlvo: alvo, plano, j })).naturezas;
  const custosProjetados = naturezas.flatMap((n) =>
    Object.entries(n.valores).map(([mes, valor]) => ({ mascara_id: n.mascara_id, centro_id: id, data: `${mes}-01`, valor }))
  );
  // Correção monetária digitada (só se a linha estiver numa etapa do centro).
  const temCorrecao = d.mascaras.some((m) => m.calculo === 'CORRECAO_MONETARIA' && (obra || p.etapaDe(m) === 'demais'));
  const correcao = temCorrecao
    ? Object.entries((usarFoto ? foto.correcao : orc.dados?.correcao) || {})
        .filter(([mes, v]) => meses.has(mes) && num(v) !== 0)
        .map(([mes, v]) => ({ centro_id: id, data: `${mes}-01`, valor: num(v) }))
    : [];

  const motor = demonstrativo.construir({
    ...d,
    unidadesCentros: d.unidadesCentros.map((x) => (x.id === id ? cortado : x)).filter(Boolean),
    corr: [...d.corr.filter((r) => r.data <= j.travaFim), ...correcao],
    custos: [...d.custos, ...custosProjetados],
  });
  return { j, centro, d, obra, p, motor, vendas, naturezas, correcao, usouFoto: usarFoto };
}

// O orçamento inteiro: realizado até a trava + projetado depois dela, no motor da DRE.
async function calcular(empresaId, orc, opcoes = {}) {
  const [{ j, centro, d, obra, motor, vendas, naturezas, correcao }, arvore] = await Promise.all([
    prepararMotor(empresaId, orc, opcoes),
    dreMascaras.list(empresaId),
  ]);
  const id = orc.centro_id;
  // Calcula desde o primeiro lançamento do centro (não só do ciclo): a foto mês a mês do orçamento traz
  // todo o realizado antes do corte — é o "projetado" desses meses na comparação da aba DRE (pedido do
  // usuário: não respeitar o ciclo).
  const primeiro = await primeiroMes(empresaId, id);
  const de = [j.cicloInicio, j.inicioProjecao, primeiro].filter(Boolean).sort()[0];
  const r = await demonstrativo.calcular(empresaId, { de: `${de}-01`, ate: fimMes(j.cicloFim), centros: [id] }, motor);
  const porMes = new Map(r.meses.map((x) => [x.mes, x.valores]));
  const ids2 = arvore.flatMap((g) => g.filhos.map((f) => f.id));

  // Fechamento do orçamento: do primeiro lançamento do centro (realizado até a trava) ao fim do ciclo
  // (projetado) — o mesmo que a coluna Projetado da aba DRE no período inteiro (pedido do usuário).
  const realizado = somaDosMeses(r.meses.filter((x) => x.mes <= j.trava).map((x) => x.valores), ids2);
  const projetado = somaDosMeses(r.meses.filter((x) => x.mes > j.trava).map((x) => x.valores), ids2);
  const total = Object.fromEntries(ids2.map((x) => [x, num(realizado[x]) + num(projetado[x])]));

  const pocEm = (mes) => {
    const fim = fimMes(mes);
    return {
      mes,
      receita: motor.pocEm ? motor.pocEm(id, fim).poc : null,
      despesa: motor.pocDespesa(id, fim),
      distratada: motor.fracaoDistratada(id, fim),
      custo: motor.pocEm ? motor.pocEm(id, fim).custo : null,
      orcamento: motor.pocEm ? motor.pocEm(id, fim).orcamento : null,
    };
  };
  const linhaPoc = (m) => m.realiza_poc || m.calculo === 'ESTORNO_CUSTO';
  const nivel2 = d.mascaras.map((m) => ({
    id: m.id,
    descricao: m.descricao,
    parent_id: m.parent_id,
    poc: linhaPoc(m),
    meses: Object.fromEntries(j.meses.map((mes) => [mes, porMes.get(mes)?.[m.id] ?? null])),
    realizado: realizado[m.id],
    projetado: projetado[m.id],
    total: total[m.id],
  }));

  const mensal = {
    meses: r.meses.map((x) => x.mes),
    trava: j.trava,
    valores: Object.fromEntries(ids2.map((m) => [m, r.meses.map((x) => (x.valores[m] === null || x.valores[m] === undefined ? null : Math.round(x.valores[m] * 100) / 100))])),
  };

  return {
    janela: {
      ciclo_inicio: j.cicloInicio,
      ciclo_fim: j.cicloFim,
      trava: j.trava,
      inicio_projecao: j.inicioProjecao,
      realizado_de: mensal.meses[0] || null,
    },
    meses: j.meses,
    centro: { id, nome: centro.apelido || centro.nome, natureza: centro.natureza },
    niveis1: niveis1DaFoto(arvore, mensal),
    nivel2,
    poc: obra ? { trava: pocEm(j.trava), meses: j.meses.map(pocEm) } : null,
    // O que entrou de cada origem (fica na versão salva).
    vendas,
    naturezas: naturezas.map((n) => ({ natureza_id: n.natureza_id, nome: n.nome, mascara_id: n.mascara_id, origem: n.origem, valores: n.valores })),
    correcao: Object.fromEntries(correcao.map((x) => [x.data.slice(0, 7), x.valor])),
    // A DRE do orçamento mês a mês, nível 2, do primeiro lançamento do centro ao fim do ciclo: até a trava
    // é o realizado na data do cálculo; depois, o projetado. `valores[mascara]` alinhado com `meses`. É o
    // que a aba DRE compara com o realizado (coluna Projetado / Desvio).
    mensal,
  };
}

// O fechamento no nível 1 pela foto mês a mês (`mensal`, valores já em centavos): realizado = meses até a
// trava, projetado = depois dela, total = tudo (do primeiro lançamento do centro ao fim do ciclo). Soma
// os mesmos números da coluna Projetado da aba DRE no período inteiro. Também refaz o fechamento das
// fotos gravadas antes (que somavam só a partir do início do ciclo).
function niveis1DaFoto(arvore, mensal) {
  const ids2 = arvore.flatMap((g) => g.filhos.map((f) => f.id));
  const soma = (filtro) =>
    Object.fromEntries(
      ids2.map((id) => {
        const arr = mensal.valores?.[id] || [];
        return [id, mensal.meses.reduce((t, m, i) => (filtro(m) ? t + num(arr[i]) : t), 0)];
      })
    );
  const realizado = soma((m) => m <= mensal.trava);
  const projetado = soma((m) => m > mensal.trava);
  const total = soma(() => true);
  const [n1Real, n1Proj, n1Tot] = [realizado, projetado, total].map((v) => totaisNivel1(arvore, v));
  const r2 = (v) => Math.round(v * 100) / 100;
  return arvore.map((g, i) => ({
    id: g.id,
    descricao: g.descricao,
    totalizadora: g.totalizadora,
    realizado: r2(n1Real[i].valor),
    projetado: r2(n1Proj[i].valor),
    total: r2(n1Tot[i].valor),
  }));
}

// ---------------------------------------------------------------- histórico

// Primeiro mês com algum lançamento do centro (títulos, extrato, contratos, lançamentos criados).
async function primeiroMes(empresaId, centroId) {
  const { rows } = await pool.query(
    `SELECT to_char(LEAST(
       (SELECT MIN(t.issue_date) FROM sie_outcome_categorias c
          JOIN sie_outcome t ON t.bill_id = c.bill_id AND t.installment_id = c.installment_id AND t.empresa_id = c.empresa_id
         WHERE c.empresa_id = $1 AND c.cost_center_id = $2 AND t.issue_date >= DATE '2000-01-01'),
       (SELECT MIN(t.issue_date) FROM sie_income_categorias c
          JOIN sie_income t ON t.bill_id = c.bill_id AND t.installment_id = c.installment_id AND t.empresa_id = c.empresa_id
         WHERE c.empresa_id = $1 AND c.cost_center_id = $2 AND t.issue_date >= DATE '2000-01-01'),
       (SELECT MIN(data) FROM sie_extrato_contas_rateio WHERE empresa_id = $1 AND centro_id = $2 AND data >= DATE '2000-01-01'),
       (SELECT MIN(contract_date) FROM sie_sales_contracts WHERE empresa_id = $1 AND enterprise_id = $2 AND contract_date >= DATE '2000-01-01'),
       (SELECT MIN(data) FROM lancamentos_manuais WHERE empresa_id = $1 AND centro_id = $2)
     ), 'YYYY-MM') AS mes`,
    [empresaId, centroId]
  );
  return rows[0]?.mes || null;
}

// A DRE realizada do centro até o fim do mês `ateMes` (a trava escolhida; sem ela, o mês anterior ao
// atual), informativa, no MESMO formato da DRE (demonstrativo.calcular) pra a tela usar a tabela da aba
// DRE: `resultado.valores` = o consolidado e `resultado.por_centro` = uma coluna por ano com algum
// valor (com os meses dele e o mês anterior, pro mês a mês com AH %). `trava_sugerida`: o mês anterior
// ao atual; `primeiro_mes`: o primeiro lançamento do centro (limite da trava).
async function historico(empresaId, orc, ateMes = null) {
  const atual = mesAtual();
  const sugerida = somarMeses(atual, -1);
  const [primeiro, arvore] = await Promise.all([primeiroMes(empresaId, orc.centro_id), dreMascaras.list(empresaId)]);
  const ate = /^\d{4}-\d{2}$/.test(ateMes || '') ? ateMes : orc.trava || sugerida;
  const base = { trava_sugerida: sugerida, mes_atual: atual, primeiro_mes: primeiro, ate, arvore };
  if (!primeiro || primeiro > atual || primeiro > ate) return { ...base, tem_historico: false, anos: [], resultado: null };
  const r = await demonstrativo.calcular(empresaId, {
    de: `${primeiro.slice(0, 4)}-01-01`,
    ate: fimMes(ate),
    centros: [orc.centro_id],
  });
  const ids2 = arvore.flatMap((g) => g.filhos.map((f) => f.id));
  const porAno = new Map();
  r.meses.forEach((m) => {
    const ano = m.mes.slice(0, 4);
    if (!porAno.has(ano)) porAno.set(ano, []);
    porAno.get(ano).push(m);
  });
  const anteriorDe = (m) => {
    const i = r.meses.findIndex((x) => x.mes === m.mes);
    return i > 0 ? r.meses[i - 1] : r.por_centro[0]?.mes_anterior || null;
  };
  const anos = [...porAno.keys()]
    .sort()
    .map((ano) => {
      const meses = porAno.get(ano);
      return {
        id: Number(ano),
        nome: ano,
        valores: somaDosMeses(meses.map((m) => m.valores), ids2),
        meses: meses.map((m) => ({ mes: m.mes, de: m.de, ate: m.ate, valores: m.valores })),
        mes_anterior: anteriorDe(meses[0]),
      };
    })
    .filter((a) => ids2.some((x) => Math.abs(num(a.valores[x])) >= 0.005));
  if (!anos.length) return { ...base, tem_historico: false, anos: [], resultado: null };
  return {
    ...base,
    tem_historico: true,
    anos: anos.map((a) => a.nome),
    resultado: {
      de: r.de,
      ate: r.ate,
      valores: r.valores,
      por_centro: anos,
      avaliacao_vertical: r.avaliacao_vertical,
      poc_receita: { mascara: r.poc_receita.mascara },
    },
  };
}

module.exports = {
  janela,
  unidades,
  contas,
  calcular,
  niveis1DaFoto,
  prepararMotor,
  historico,
  somarMeses,
  mesesEntre,
  mesAtual,
  primeiroMes,
  unidadesNaTrava,
  vendaDaUnidade,
  papeis,
  ORIGEM,
};
