// GERADO por backend/scripts/sincronizar-painel-fluxo.js a partir de
// frontend/src/pages/Dashboards/EconomicoFinanceiro/fluxo/analise.js — NÃO EDITE AQUI: edite lá e rode o script.
// Análises do painel do Fluxo de Caixa sobre o modelo (modelo.js): o que cada seção mostra — valores,
// etiquetas (bom / atenção / crítico), ordenações e destaques. Sem JSX nem navegador: é usado pela tela
// (secoes.jsx) e, copiado para o backend por backend/scripts/sincronizar-painel-fluxo.js, pela
// ferramenta dfc_painel_fluxo_caixa do MCP — assim o Claude lê o painel exatamente como a tela mostra.
// Textos com destaque vêm como partes: string ou { b: 'texto em negrito' }.
const { CFG, brl, curto, lbl, media, nf0, pct, soma, titulo } = require('./modelo');

// Etiqueta: { tom: 'good' | 'warn' | 'crit' | 'info', texto }.
const etiqueta = (tom, texto) => ({ tom, texto });
const sev = (crit, aten, ok = 'Ok') => (crit ? etiqueta('crit', 'Crítico') : aten ? etiqueta('warn', 'Atenção') : etiqueta('good', ok));
const meses = (n) => `${n} ${n === 1 ? 'mês' : 'meses'}`;

// ─── Indicadores (8 cards) ───────────────────────────────────────────────────────────────────────
function indicadores(D) {
  const fco = soma(D.entR) + soma(D.saiR);
  const prox = D.resFut.slice(0, 6);
  const queima = media(prox);
  const fura = D.saldoFut.findIndex((v) => v < D.colchao);
  const dividaHoje = soma(D.cef.map((c) => c.now?.saldo || 0));
  const dividaFim = soma(D.cef.map((c) => c.end?.saldo || 0));
  const rec = D.cart.receber || {};
  const inad = ((rec.vencido || 0) / ((rec.vencido || 0) + (rec.a_vencer || 0))) * 100;
  const maior = D.spes.slice().sort((a, b) => b.caixa - a.caixa)[0];
  const fatia = maior && D.totalContas > 0 ? (maior.caixa / D.totalContas) * 100 : null;
  return [
    {
      chave: 'caixa_hoje',
      titulo: 'Caixa hoje',
      valor: D.caixaHoje,
      valor_fmt: brl(D.caixaHoje),
      detalhe: D.totalContas ? [{ b: pct((D.invest / D.totalContas) * 100) }, ` aplicado · ${D.contas.length} contas`] : ['abertura do mês atual'],
      etiqueta: D.caixaHoje < D.colchao ? etiqueta('crit', 'Abaixo do colchão') : etiqueta('good', 'Líquido'),
    },
    {
      chave: 'minimo_projetado',
      titulo: 'Mínimo projetado',
      valor: D.minBase,
      valor_fmt: brl(D.minBase),
      detalhe: ['em ', { b: lbl(D.fut[D.minIdx]) }, ` · ${D.caixaHoje ? pct((D.minBase / D.caixaHoje - 1) * 100, true) : '–'} vs. hoje`],
      etiqueta: sev(D.minBase < D.colchao, D.minBase < 2 * D.colchao, 'Confortável'),
    },
    {
      chave: 'resultado_medio',
      titulo: `Resultado médio · próximos ${meses(prox.length)}`,
      valor: queima,
      valor_fmt: brl(queima, true),
      detalhe: fura < 0 ? [{ b: 'acima do colchão' }, ' em todo o horizonte'] : ['fura o colchão em ', { b: lbl(D.fut[fura]) }],
      etiqueta: sev(fura >= 0 && fura < 3, queima < 0, 'Gera caixa'),
    },
    {
      chave: 'fluxo_operacional',
      titulo: `Fluxo operacional · últimos ${meses(D.hist.length)}`,
      valor: D.hist.length ? fco : null,
      valor_fmt: D.hist.length ? brl(fco, true) : '–',
      detalhe: ['entradas de ', { b: brl(soma(D.entR)) }],
      etiqueta: !D.hist.length ? etiqueta('info', 'Sem histórico') : fco < 0 ? etiqueta('warn', 'Consome caixa') : etiqueta('good', 'Positivo'),
    },
    {
      chave: 'divida_pj',
      titulo: 'Dívida PJ Caixa',
      valor: D.cef.length ? dividaHoje : null,
      valor_fmt: D.cef.length ? brl(dividaHoje) : '–',
      detalhe: D.cef.length
        ? ['vai a ', { b: brl(dividaFim) }, ` no fim da projeção · ${D.cef.length} obra${D.cef.length > 1 ? 's' : ''}`]
        : ['nenhuma obra com Projeção CEF no escopo'],
      etiqueta: D.cef.length
        ? dividaFim > dividaHoje * 1.5
          ? etiqueta('warn', 'Crescente')
          : etiqueta('info', 'Sob controle')
        : etiqueta('info', 'Sem dados'),
    },
    {
      chave: 'receber_90_dias',
      titulo: 'A receber em 90 dias',
      valor: rec.d90 || 0,
      valor_fmt: brl(rec.d90 || 0),
      detalhe: ['carteira a vencer de ', { b: brl(rec.a_vencer || 0) }],
      etiqueta: etiqueta('info', 'Carteira'),
    },
    {
      chave: 'inadimplencia',
      titulo: 'Inadimplência',
      valor: Number.isFinite(inad) ? inad : null,
      valor_fmt: pct(inad),
      detalhe: [{ b: brl(rec.vencido || 0) }, ` vencidos em ${nf0.format(rec.n_vencido || 0)} parcelas`],
      etiqueta: Number.isFinite(inad) ? sev(inad > 8, inad > 3, 'Baixa') : etiqueta('info', 'Sem dados'),
    },
    {
      chave: 'concentracao_caixa',
      titulo: 'Maior concentração de caixa',
      valor: fatia,
      valor_fmt: fatia === null ? '–' : pct(fatia),
      detalhe: maior ? [{ b: curto(maior.nome) }, ` · ${brl(maior.caixa)}`] : [],
      etiqueta: sev(false, fatia > 40, 'Distribuído'),
    },
  ];
}

// ─── Trajetória do caixa ─────────────────────────────────────────────────────────────────────────
// `escopo`: nome do filtro em uso (empresa, centro ou "N centros"); null = consolidado.
function tituloTrajetoria(D, escopo) {
  const de = escopo ? `de ${escopo}` : 'consolidado';
  const queda = D.caixaHoje ? (D.minBase / D.caixaHoje - 1) * 100 : 0;
  return D.minBase < D.caixaHoje
    ? `O caixa ${de} chega a ${brl(D.minBase)} em ${lbl(D.fut[D.minIdx])} (${pct(queda, true)})`
    : `O caixa ${de} cresce no horizonte`;
}

// Obras que o simulador pode atrasar (com entradas projetadas), da maior entrada para a menor.
const opcoesAtraso = (D) => D.centros.filter((c) => soma(c.entP) > 0).sort((a, b) => soma(b.entP) - soma(a.entP));

// ─── Fôlego de cada SPE ──────────────────────────────────────────────────────────────────────────
// ordem: 'risco' | 'caixa' | 'nome'; mostrar: 'todas' | 'zeram'.
function folego(D, { ordem = 'risco', mostrar = 'todas' } = {}) {
  const empresas = D.spes.map((s) => {
    const mn = Math.min(...s.path);
    const drop = s.caixa > 0 ? mn / s.caixa : mn < 0 ? -1 : 1;
    const situacao = s.zera
      ? etiqueta('crit', `Zera em ${lbl(s.zera)}`)
      : drop < 0.5
        ? etiqueta('warn', `Cai ${pct((1 - drop) * 100)}`)
        : etiqueta('good', 'Cobre');
    return { ...s, min: mn, minIdx: Math.max(0, s.path.indexOf(mn)), drop, situacao };
  });
  const zeram = empresas.filter((s) => s.zera).sort((a, b) => (a.zera < b.zera ? -1 : a.zera > b.zera ? 1 : a.min - b.min));
  const positivo = soma(empresas.map((s) => Math.max(0, s.caixa)));
  const maior = empresas.slice().sort((a, b) => b.caixa - a.caixa)[0];
  const porNome = (a, b) => curto(a.nome).localeCompare(curto(b.nome), 'pt-BR', { numeric: true });
  const linhas = empresas
    .filter((s) => mostrar === 'todas' || s.zera)
    .sort(
      ordem === 'caixa'
        ? (a, b) => b.caixa - a.caixa
        : ordem === 'nome'
          ? porNome
          : (a, b) => {
              const za = a.zera || '9999';
              const zb = b.zera || '9999';
              return za < zb ? -1 : za > zb ? 1 : a.drop - b.drop || porNome(a, b);
            }
    );
  const somaPath = D.fut.map((_, i) => soma(empresas.map((s) => s.path[i])));
  const total = { nome: `Soma das ${empresas.length} empresas`, centros: ['sem mútuos entre elas'], caixa: soma(empresas.map((s) => s.caixa)), path: somaPath };
  total.min = Math.min(...somaPath);
  total.minIdx = Math.max(0, somaPath.indexOf(total.min));
  const resumo = {
    empresas: empresas.length,
    zeram: zeram.length ? `${zeram.length} de ${empresas.length}` : 'nenhuma',
    primeira_a_zerar: zeram[0] ? `${curto(zeram[0].nome)} · ${lbl(zeram[0].zera)}` : '–',
    maior_fatia: maior && positivo > 0 ? `${curto(maior.nome)} · ${pct((Math.max(0, maior.caixa) / positivo) * 100)}` : '–',
  };
  return { empresas, zeram, linhas, total, resumo };
}

// ─── Quem gera e quem consome caixa ──────────────────────────────────────────────────────────────
// Só centros com "Projeta DFC", do que mais gera ao que mais consome (projetado).
function quemGera(D) {
  const linhas = D.centros
    .filter((c) => c.projeta !== false)
    .sort((a, b) => b.lp - a.lp)
    .map((r) => ({
      ...r,
      etiqueta:
        r.contrato && !r.param && r.capR > 0 && Math.abs(r.capP) < 1
          ? { classe: 'flag w', texto: 'CEF fora', dica: 'Recebeu repasse CEF e não tem projeção' }
          : r.param
            ? { classe: 'flag', texto: 'CEF', dica: 'Projeção CEF ativa' }
            : null,
    }));
  const maximo = Math.max(1, ...linhas.flatMap((r) => [Math.abs(r.lr), Math.abs(r.lp)]));
  return { linhas, maximo };
}

// ─── Carteira e liquidez ─────────────────────────────────────────────────────────────────────────
function carteira(D) {
  const rec = D.cart.receber || {};
  const pag = D.cart.pagar || {};
  return {
    numeros: [
      { rotulo: 'Liquidez imediata', valor: D.totalContas - D.invest },
      { rotulo: 'Em aplicações', valor: D.invest },
      { rotulo: 'A receber a vencer', valor: rec.a_vencer || 0 },
      { rotulo: 'A pagar em aberto', valor: (pag.vencido || 0) + (pag.a_vencer || 0) },
    ],
    // Todas as contas com "Projeta DFC" (as que formam o caixa do DFC), da maior para a menor.
    contas: D.contas
      .filter((c) => !D.empresasDoFiltro || D.empresasDoFiltro.has(c.company_id))
      .sort((a, b) => b.saldo - a.saldo)
      .map((c) => ({ ...c, investimento: CFG.investimento.test(c.tipo) })),
  };
}

// ─── O Orçamento erra para qual lado? ────────────────────────────────────────────────────────────
// As 8 linhas com maior diferença em R$ (somando mais de R$ 20 mil). `ruim`: saída maior ou entrada menor.
function calibracao(D) {
  return D.calib
    .filter((c) => Math.abs(c.p) > 0 && Math.abs(c.r) + Math.abs(c.p) > 20000)
    .map((c) => {
      const dv = (c.r / c.p - 1) * 100;
      return { ...c, dv, gap: Math.abs(c.r - c.p), ruim: c.lado === 'sai' ? dv > 0 : dv < 0 };
    })
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 8);
}

// ─── Maiores saídas operacionais ─────────────────────────────────────────────────────────────────
// Top 10 favorecidos; `linha`: a linha do fluxo com mais saída daquele favorecido; `obra`: custo de obra.
function maioresSaidas(forn) {
  const g = {};
  (forn || []).forEach((r) => {
    const k = r.nome || 'Sem favorecido';
    const o = (g[k] = g[k] || { nome: k, valor: 0, n: 0, mask: {} });
    o.valor += r.valor;
    o.n += r.n;
    o.mask[r.mascara] = (o.mask[r.mascara] || 0) + r.valor;
  });
  return Object.values(g)
    .sort((a, b) => a.valor - b.valor)
    .slice(0, 10)
    .map((f) => {
      const linha = Object.entries(f.mask).sort((a, b) => a[1] - b[1])[0]?.[0] || '';
      return { nome: f.nome, valor: f.valor, lancamentos: f.n, linha: titulo(linha), obra: CFG.obra.test(linha) };
    });
}

// ─── Dívida PJ da Caixa por obra ─────────────────────────────────────────────────────────────────
function dividaPj(D) {
  return D.cef.map((c) => {
    const registradas = c.p.unid_registradas || 0;
    const geral = c.p.unid_geral || 0;
    return {
      ...c,
      unidades: {
        total: c.p.numero_unidades || 0,
        registradas,
        sem_registro: Math.max(0, geral - registradas),
        sem_contrato: Math.max(0, (c.p.numero_unidades || 0) - geral),
      },
    };
  });
}

module.exports = { etiqueta, sev, indicadores, tituloTrajetoria, opcoesAtraso, folego, quemGera, carteira, calibracao, maioresSaidas, dividaPj };
