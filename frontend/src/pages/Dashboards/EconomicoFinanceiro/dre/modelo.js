import { addM, brl, pct } from '../fluxo/modelo';

// Modelo do painel da Demonstração do Resultado (dashboard Econômico Financeiro), sobre os dados da rota
// /dashboards/economico-financeiro/dre (backend dashboards/drePainel.service.js — o mesmo motor da aba DRE
// do DRE Gerencial). Tudo aqui é conta pura; as seções (secoes.jsx) e os gráficos (graficos.jsx) só desenham.
//
// Os resultados vêm das totalizadoras da aba Máscaras, na ordem de lá (os nomes são os do usuário):
// a 1ª é a Receita Líquida, a 2ª o Lucro Bruto, a penúltima o EBITDA (com 4 ou mais) e o resultado final é
// a soma de todas as linhas (= a última totalizadora quando ela fecha a DRE). Margens sobre a Receita Líquida.

const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const dataBr = (iso) => (iso ? iso.split('-').reverse().join('/') : '–');
export const diaMes = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '–');
export const mesLongo = (m) => `${MES_LONGO[+m.slice(5, 7) - 1]} de ${m.slice(0, 4)}`;
const perto = (v) => v === null || v === undefined || Math.abs(v) < 0.005;
const div = (a, b) => (a === null || a === undefined || !b ? null : a / b);
const pp = (f) => (f === null || f === undefined ? '–' : `${f > 0 ? '+' : ''}${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`);
export { pp };

// Nome de máscara ou centro em caixa de título, sem estragar siglas (RET, PLR, CIV, EBITDA…) e com os
// conectivos em minúsculas ("Receita com Venda de Imóveis").
const SIGLAS = new Set(['RET', 'PLR', 'CIV', 'EBITDA', 'PIS', 'COFINS', 'IRPJ', 'CSLL', 'ISS', 'INSS', 'IR', 'VGV', 'SPE', 'PJ', 'CEF', 'ADM', 'TD', 'ON']);
const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'com', 'a', 'o', 'as', 'os', 'para', 'por', 'sem', 'na', 'no', 'nas', 'nos', 'ao', 'à', 'às']);
export function nome(s) {
  return String(s || '')
    .split(/(\s+|-|\/)/)
    .map((w, i) => {
      if (!w || /^(\s+|-|\/)$/.test(w)) return w;
      const u = w.toUpperCase();
      if (SIGLAS.has(u.replace(/[^A-ZÇÃÕÁÉÍÓÚÂÊÔ]/g, ''))) return u;
      const l = w.toLowerCase();
      if (i > 0 && CONECTIVOS.has(l)) return l;
      return l.replace(/^(\(?)(\p{L})/u, (m, a, b) => a + b.toUpperCase());
    })
    .join('');
}

// "jan/26 a out/26" (ou "jan a out/26" no mesmo ano).
export function rotuloPeriodo(de, ate) {
  const a = de.slice(0, 7);
  const b = ate.slice(0, 7);
  const mes = (m) => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m.slice(5, 7) - 1];
  if (a === b) return `${mes(a)}/${a.slice(2, 4)}`;
  return a.slice(0, 4) === b.slice(0, 4) ? `${mes(a)} a ${mes(b)}/${b.slice(2, 4)}` : `${mes(a)}/${a.slice(2, 4)} a ${mes(b)}/${b.slice(2, 4)}`;
}

// ─── Estrutura da DRE ────────────────────────────────────────────────────────────────────────────
// Total de cada grupo (soma das linhas de nível 2) e de cada totalizadora (tudo acima dela), como a aba
// DRE: null quando alguma linha de que depende ainda não tem cálculo.
export function totais(arvore, valores) {
  const out = {};
  let soma = 0;
  let completo = true;
  for (const g of arvore) {
    if (g.totalizadora) {
      out[g.id] = completo ? soma : null;
      continue;
    }
    let t = 0;
    let ok = g.filhos.length > 0;
    for (const f of g.filhos) {
      const v = valores?.[f.id];
      if (v === null || v === undefined) {
        ok = false;
        completo = false;
      } else {
        t += v;
        soma += v;
      }
    }
    out[g.id] = ok ? t : null;
  }
  return out;
}

// As linhas-chave pela posição das totalizadoras.
function chaves(arvore) {
  const tots = arvore.filter((g) => g.totalizadora);
  const grupos = arvore.filter((g) => !g.totalizadora);
  const ultima = arvore.at(-1);
  return {
    receitaBruta: grupos[0] || null,
    receitaLiquida: tots[0] || null,
    lucroBruto: tots[1] || null,
    ebitda: tots.length >= 4 ? tots[tots.length - 2] : null,
    lucroLiquido: ultima?.totalizadora ? ultima : null,
  };
}

// Receita Bruta, Receita Líquida, Lucro Bruto, EBITDA e resultado de um conjunto de valores.
function indicadoresDe(D, valores) {
  const t = totais(D.arvore, valores);
  const de = (g) => (g ? t[g.id] : null);
  const tudo = D.arvore.filter((g) => !g.totalizadora).flatMap((g) => g.filhos);
  const resultado = tudo.some((f) => valores?.[f.id] === null || valores?.[f.id] === undefined) ? null : tudo.reduce((s, f) => s + valores[f.id], 0);
  const rb = de(D.k.receitaBruta);
  const rl = de(D.k.receitaLiquida);
  const lb = de(D.k.lucroBruto);
  const eb = de(D.k.ebitda);
  return { t, rb, rl, lb, eb, ll: resultado, mb: div(lb, rl), me: div(eb, rl), ml: div(resultado, rl) };
}

// ─── Preparação ──────────────────────────────────────────────────────────────────────────────────
export function preparar(dados) {
  const { meta, arvore, atual, anterior, poc, centros } = dados;
  const D = { meta, arvore, k: chaves(arvore), centrosLista: centros };
  // Máscara de nível 2 por id (com o grupo dela).
  D.mascara = {};
  arvore.forEach((g) => g.filhos.forEach((f) => (D.mascara[f.id] = { ...f, grupo: g })));
  D.nomes = {
    rb: D.k.receitaBruta ? nome(D.k.receitaBruta.descricao) : 'Receita bruta',
    rl: D.k.receitaLiquida ? nome(D.k.receitaLiquida.descricao) : 'Receita líquida',
    lb: D.k.lucroBruto ? nome(D.k.lucroBruto.descricao) : 'Lucro bruto',
    eb: D.k.ebitda ? nome(D.k.ebitda.descricao) : 'EBITDA',
    ll: D.k.lucroLiquido ? nome(D.k.lucroLiquido.descricao) : 'Resultado do período',
  };

  D.atual = { valores: atual.valores, ...indicadoresDe(D, atual.valores) };
  D.anterior = { valores: anterior.valores, ...indicadoresDe(D, anterior.valores) };
  D.avaliacaoVertical = atual.avaliacao_vertical;
  D.semPocReceita = !atual.poc_receita?.mascara;

  // Mês a mês (o mesmo mês do ano anterior ao lado).
  const antPorMes = new Map((anterior.meses || []).map((m) => [m.mes, m]));
  D.meses = (atual.meses || []).map((m) => {
    const a = antPorMes.get(addM(m.mes, -12));
    return { mes: m.mes, de: m.de, ate: m.ate, ...indicadoresDe(D, m.valores), ant: a ? indicadoresDe(D, a.valores) : null };
  });

  // Por centro de custo (na ordem da aba Centros Custos).
  const natureza = new Map((centros || []).map((c) => [c.id, c.natureza]));
  D.centros = (atual.por_centro || []).map((c) => ({ id: c.id, nome: nome(c.nome), natureza: natureza.get(c.id) || null, ...indicadoresDe(D, c.valores) }));

  D.poc = prepararPoc(D, poc);
  D.origem = origemDaReceita(D);
  D.rates = aliquotasEfetivas(D);
  return D;
}

// ─── POC por obra ────────────────────────────────────────────────────────────────────────────────
// Cada linha com POC se abre em duas partes (backend poc.service.js: acumulado/poc no fim e no início):
//   receita (POC de Receita = obra executada): avanço de obra sobre a base antiga = base_início × ΔPOC;
//     vendas novas = (base − base_início) × POC de agora;
//   custo/despesa (POC de Despesa = fração vendida): vendas novas = base_início × Δfração; custo novo da
//     obra sobre o que já estava vendido = (base − base_início) × fração de agora.
function prepararPoc(D, poc) {
  const linhas = (poc?.linhas || []).map((l) => {
    const m = D.mascara[l.id];
    return { ...l, calculo: m?.calculo || null, grupo: m?.grupo?.id ?? null, nome: nome(l.descricao) };
  });
  const grupoCiv = linhas.find((l) => l.estorno)?.grupo ?? null;
  const ehCiv = (l) => l.tipo === 'DESPESA' && !l.estorno && grupoCiv !== null && l.grupo === grupoCiv;
  const ehVendas = (l) => l.tipo === 'RECEITA' && (l.calculo === 'VALOR_VENDAS' || l.calculo === 'RECEITA_PERMUTA');
  const custoPoc = poc?.poc_receita_mascara?.id ?? null;

  const partes = (l, x) => {
    if (!x) return { obra: 0, vendas: 0 };
    const antiga = x.acumulado_inicio * (x.poc - x.poc_inicio);
    const nova = (x.acumulado - x.acumulado_inicio) * x.poc;
    return l.tipo === 'RECEITA' ? { obra: antiga, vendas: nova } : { obra: nova, vendas: antiga };
  };

  const obras = (poc?.obras || []).map((o) => {
    const f = o.periodo;
    const soma = (filtro, campo) => linhas.filter(filtro).reduce((s, l) => s + (f.linhas[l.id]?.[campo] ?? 0), 0);
    const receita = (l) => l.tipo === 'RECEITA';
    const despesa = (l) => l.tipo === 'DESPESA';
    const recPeriodo = soma(receita, 'periodo');
    const custoPeriodo = soma(despesa, 'periodo');
    const aRecReceita = soma(receita, 'a_reconhecer');
    const aRecCusto = soma(despesa, 'a_reconhecer');
    const recObra = linhas.filter(receita).reduce((s, l) => s + partes(l, f.linhas[l.id]).obra, 0);
    const recVendas = linhas.filter(receita).reduce((s, l) => s + partes(l, f.linhas[l.id]).vendas, 0);
    const pr = f.poc_receita;
    // Resultado a apropriar (o REF das incorporadoras): a receita já vendida que falta reconhecer menos o
    // custo que ainda falta gastar na obra na proporção do que está vendido (o custo já gasto das unidades
    // em estoque não entra: ele vai com a receita delas quando forem vendidas). Sem orçamento não dá para
    // saber o custo que falta.
    const vendidaLiq = Math.max(0, Math.min(1, f.poc_despesa.liquida));
    const custoAIncorrer = pr && pr.orcamento > 0 ? Math.max(0, pr.orcamento - pr.custo) : null;
    const custoAApropriar = custoAIncorrer === null ? null : -custoAIncorrer * vendidaLiq;
    const margemApropriar = custoAApropriar === null ? null : aRecReceita + custoAApropriar;
    return {
      id: o.id,
      nome: nome(o.nome),
      foto: f,
      meses: o.meses,
      pocR: pr?.poc ?? null,
      pocRIni: pr?.poc_inicio ?? null,
      orcamento: pr?.orcamento ?? null,
      custo: pr?.custo ?? null,
      saldo: pr?.saldo ?? null,
      vendida: f.poc_despesa.liquida,
      vendidaIni: f.poc_despesa.liquida_inicio,
      pocD: f.poc_despesa.poc,
      distratada: f.poc_despesa.distratada,
      fracEstoque: f.poc_despesa.estoque,
      un: f.unidades,
      recPeriodo,
      custoPeriodo,
      margemPeriodo: recPeriodo + custoPeriodo,
      aRecReceita,
      aRecCusto,
      custoAIncorrer,
      custoAApropriar,
      margemApropriar,
      margemApropriarPct: div(margemApropriar, aRecReceita),
      estourada: pr && pr.orcamento > 0 && pr.custo > pr.orcamento,
      recObra,
      recVendas,
    };
  });

  const soma = (campo) => obras.reduce((s, o) => s + (o[campo] ?? 0), 0);
  const comOrc = obras.filter((o) => o.orcamento > 0);
  const orcTotal = comOrc.reduce((s, o) => s + o.orcamento, 0);
  const carteira = {
    obras: obras.length,
    orcamento: orcTotal,
    custo: comOrc.reduce((s, o) => s + Math.min(o.custo, o.orcamento), 0),
    pocR: orcTotal ? comOrc.reduce((s, o) => s + Math.min(o.custo, o.orcamento), 0) / orcTotal : null,
    pocRIni: orcTotal ? comOrc.reduce((s, o) => s + o.orcamento * (o.pocRIni ?? 0), 0) / orcTotal : null,
    saldo: comOrc.reduce((s, o) => s + Math.max(0, o.saldo ?? 0), 0),
    aRecReceita: soma('aRecReceita'),
    aRecCusto: soma('aRecCusto'),
    custoAApropriar: soma('custoAApropriar'),
    margemApropriar: soma('margemApropriar'),
    // Obras sem orçamento: a receita a apropriar delas fica fora do resultado a apropriar.
    semOrcamento: obras.filter((o) => o.margemApropriar === null),
    aRecSemOrcamento: obras.filter((o) => o.margemApropriar === null).reduce((s, o) => s + o.aRecReceita, 0),
    recPeriodo: soma('recPeriodo'),
    recObra: soma('recObra'),
    recVendas: soma('recVendas'),
    vendasValor: obras.reduce((s, o) => s + (o.un?.vendas_intervalo.valor ?? 0), 0),
    vendasQtd: obras.reduce((s, o) => s + (o.un?.vendas_intervalo.qtd ?? 0), 0),
    distratosValor: obras.reduce((s, o) => s + (o.un?.distratos_intervalo.valor ?? 0), 0),
    distratosQtd: obras.reduce((s, o) => s + (o.un?.distratos_intervalo.qtd ?? 0), 0),
    estoqueValor: obras.reduce((s, o) => s + (o.un?.estoque.valor ?? 0), 0),
    estoqueQtd: obras.reduce((s, o) => s + (o.un?.estoque.qtd ?? 0), 0),
    vgv: obras.reduce((s, o) => s + (o.un?.total.valor ?? 0), 0),
    unidades: obras.reduce((s, o) => s + (o.un?.total.qtd ?? 0), 0),
  };
  carteira.margemApropriarPct = div(carteira.margemApropriar, carteira.aRecReceita - carteira.aRecSemOrcamento);
  carteira.fatiaObra = div(carteira.recObra, carteira.recObra + carteira.recVendas);
  return { linhas, obras, carteira, ehCiv, ehVendas, custoPoc, partes, raw: poc };
}

// ─── De onde veio a receita reconhecida ──────────────────────────────────────────────────────────
// A Receita Bruta do período aberta pelo que a gerou: avanço de obra sobre o que já estava vendido, vendas
// novas (pela POC de hoje), permutas, correção monetária, distratos e as linhas sem POC do grupo. O que
// não vem das obras (centros sem natureza Obra) fica em "Demais centros".
function origemDaReceita(D) {
  const { linhas, obras, partes } = D.poc;
  const rb = D.atual.rb;
  if (rb === null || !D.k.receitaBruta) return [];
  const itens = [];
  const somaLinha = (filtro, fn) => obras.reduce((s, o) => s + linhas.filter(filtro).reduce((t, l) => t + fn(l, o.foto.linhas[l.id]), 0), 0);
  const vendas = (l) => l.tipo === 'RECEITA' && l.calculo === 'VALOR_VENDAS';
  const permuta = (l) => l.tipo === 'RECEITA' && l.calculo === 'RECEITA_PERMUTA';
  const outras = (l) => l.tipo === 'RECEITA' && !vendas(l) && !permuta(l);
  itens.push({
    chave: 'obra',
    rotulo: 'Avanço da obra',
    valor: somaLinha((l) => vendas(l) || permuta(l), (l, x) => partes(l, x).obra),
    dica: 'Vendas e permutas de antes do período × o quanto a obra avançou nele (POC de Receita).',
  });
  itens.push({
    chave: 'vendas',
    rotulo: 'Vendas novas',
    valor: somaLinha(vendas, (l, x) => partes(l, x).vendas),
    dica: 'Contratos assinados no período × a POC de Receita de hoje (o que já foi construído).',
  });
  itens.push({ chave: 'permuta', rotulo: 'Permutas novas', valor: somaLinha(permuta, (l, x) => partes(l, x).vendas), dica: 'Permutas avaliadas no período × a POC de hoje.' });
  linhas.filter(outras).forEach((l) =>
    itens.push({ chave: `l${l.id}`, rotulo: l.nome, valor: obras.reduce((s, o) => s + (o.foto.linhas[l.id]?.periodo ?? 0), 0), dica: 'Reconhecida pela POC de Receita.' })
  );
  // Linhas do grupo da Receita Bruta sem POC (ex.: receita com distratos).
  const cobertas = new Set(linhas.map((l) => l.id));
  D.k.receitaBruta.filhos
    .filter((f) => !cobertas.has(f.id))
    .forEach((f) => itens.push({ chave: `m${f.id}`, rotulo: nome(f.descricao), valor: D.atual.valores[f.id] ?? 0, dica: 'Linha sem POC: entra pelo valor do período.' }));
  const explicado = itens.reduce((s, i) => s + i.valor, 0);
  if (Math.abs(rb - explicado) > 1) itens.push({ chave: 'demais', rotulo: 'Demais centros (sem obra)', valor: rb - explicado, dica: 'Centros com "Realiza DRE" fora das obras.' });
  return itens.filter((i) => Math.abs(i.valor) > 0.5);
}

// ─── Fluxo da receita (Sankey) ───────────────────────────────────────────────────────────────────
// Colunas: 0 = de onde veio (cada linha positiva da DRE: vendas, permutas, correção, estorno de custo,
// receitas financeiras…); 1 = o total das entradas; 2 = para onde foi (cada grupo de nível 1 com o que
// ele consome, e o resultado que sobra); 3 = o detalhe de cada grupo com mais de uma linha. Visão bruta:
// positivos de um lado, negativos do outro — com prejuízo, ele entra do lado das entradas pra fechar.
const MIN_FONTE = 0.012; // abaixo de 1,2% das entradas, a fonte vai pra "Outras entradas"
const MIN_DETALHE = 0.006; // idem no detalhe de um grupo ("Demais")
export function fluxoDaReceita(D) {
  const v = D.atual.valores;
  const grupos = D.arvore.filter((g) => !g.totalizadora);
  const fontes = [];
  const usos = [];
  grupos.forEach((g, gi) => {
    const pos = g.filhos.filter((f) => (v[f.id] ?? 0) > 0.5).map((f) => ({ id: f.id, rotulo: nome(f.descricao), valor: v[f.id], grupo: nome(g.descricao) }));
    const neg = g.filhos.filter((f) => (v[f.id] ?? 0) < -0.5).map((f) => ({ id: f.id, rotulo: nome(f.descricao), valor: -v[f.id] }));
    fontes.push(...pos.map((p) => ({ ...p, receita: gi === 0 })));
    if (neg.length) {
      const total = neg.reduce((s, n) => s + n.valor, 0);
      usos.push({ id: `g${g.id}`, rotulo: neg.length === 1 ? neg[0].rotulo : nome(g.descricao), grupo: nome(g.descricao), valor: total, filhos: neg.length > 1 ? neg : [] });
    }
  });
  const entradas = fontes.reduce((s, f) => s + f.valor, 0);
  const saidas = usos.reduce((s, u) => s + u.valor, 0);
  if (entradas <= 0) return null;
  const resultado = entradas - saidas;

  // Fontes pequenas agrupadas.
  fontes.sort((a, b) => b.valor - a.valor);
  const pequenas = fontes.filter((f) => f.valor < entradas * MIN_FONTE);
  const col0 = pequenas.length >= 2 ? [...fontes.filter((f) => f.valor >= entradas * MIN_FONTE), { id: 'outras', rotulo: 'Outras entradas', valor: pequenas.reduce((s, f) => s + f.valor, 0), itens: pequenas }] : fontes;
  if (resultado < -0.5) col0.push({ id: 'prejuizo', rotulo: 'Prejuízo do período', valor: -resultado, tipo: 'prejuizo' });

  const col2 = usos.map((u) => ({ ...u }));
  if (resultado > 0.5) col2.push({ id: 'resultado', rotulo: D.nomes.ll, valor: resultado, tipo: 'lucro', filhos: [] });

  const col3 = [];
  col2.forEach((u) => {
    if (!u.filhos?.length) return;
    const ord = [...u.filhos].sort((a, b) => b.valor - a.valor);
    const peq = ord.filter((f) => f.valor < entradas * MIN_DETALHE);
    const lista = peq.length >= 2 ? [...ord.filter((f) => f.valor >= entradas * MIN_DETALHE), { id: `d${u.id}`, rotulo: 'Demais', valor: peq.reduce((s, f) => s + f.valor, 0), itens: peq }] : ord;
    lista.forEach((f) => col3.push({ ...f, id: `${u.id}-${f.id}`, pai: u.id }));
  });

  return {
    entradas,
    saidas,
    resultado,
    centro: { id: 'centro', rotulo: resultado < -0.5 ? 'Entradas + prejuízo' : 'Total das entradas', valor: Math.max(entradas, saidas) },
    col0,
    col2,
    col3,
  };
}

// ─── Indicadores (8 tiles) ───────────────────────────────────────────────────────────────────────
// Faixas de leitura pensadas pra incorporação: margem bruta saudável acima de 30% (as grandes de capital
// aberto rodam entre 28% e 35%), EBITDA acima de 15%, resultado líquido acima de 10%.
function tomVariacao(x) {
  if (x === null) return { tom: 'info', texto: 'Sem base de comparação' };
  if (x >= 0.05) return { tom: 'good', texto: 'Crescendo' };
  if (x > -0.05) return { tom: 'info', texto: 'Estável' };
  if (x > -0.2) return { tom: 'warn', texto: 'Em queda' };
  return { tom: 'crit', texto: 'Queda forte' };
}
function tomMargem(m, faixas) {
  if (m === null) return { tom: 'info', texto: 'Sem receita' };
  if (m < 0) return { tom: 'crit', texto: 'Negativa' };
  if (m >= faixas[0]) return { tom: 'good', texto: 'Saudável' };
  if (m >= faixas[1]) return { tom: 'info', texto: 'Adequada' };
  return { tom: 'warn', texto: 'Pressionada' };
}
const variacao = (a, b) => (a === null || b === null || !b ? null : (a - b) / Math.abs(b));

export function indicadores(D) {
  const A = D.atual;
  const B = D.anterior;
  const c = D.poc.carteira;
  const anoAnt = D.meta.anterior.de.slice(0, 4);
  const vRl = variacao(A.rl, B.rl);
  const vLl = variacao(A.ll, B.ll);
  const tiles = [
    {
      chave: 'rl',
      titulo: D.nomes.rl,
      valor_fmt: brl(A.rl),
      detalhe: [`vs. ${anoAnt}: `, { b: vRl === null ? '–' : pct(vRl * 100, true) }, c.fatiaObra !== null ? ` · ${pct(c.fatiaObra * 100)} veio do avanço de obra` : ''],
      etiqueta: tomVariacao(vRl),
    },
    {
      chave: 'mb',
      titulo: `Margem bruta`,
      valor_fmt: pct(A.mb === null ? null : A.mb * 100),
      detalhe: [`${D.nomes.lb} `, { b: brl(A.lb) }, B.mb !== null ? ` · ${anoAnt}: ${pct(B.mb * 100)}` : ''],
      etiqueta: tomMargem(A.mb, [0.3, 0.22]),
    },
    {
      chave: 'eb',
      titulo: D.k.ebitda ? D.nomes.eb : 'Resultado operacional',
      valor_fmt: brl(D.k.ebitda ? A.eb : A.lb),
      detalhe: ['margem ', { b: pct((D.k.ebitda ? A.me : A.mb) === null ? null : (D.k.ebitda ? A.me : A.mb) * 100) }, B.eb !== null ? ` · ${anoAnt}: ${brl(B.eb)}` : ''],
      etiqueta: tomMargem(D.k.ebitda ? A.me : A.mb, [0.15, 0.08]),
    },
    {
      chave: 'll',
      titulo: D.nomes.ll,
      valor_fmt: brl(A.ll),
      detalhe: ['margem ', { b: pct(A.ml === null ? null : A.ml * 100) }, ` · ${anoAnt}: `, { b: brl(B.ll) }, vLl !== null ? ` (${pct(vLl * 100, true)})` : ''],
      etiqueta: A.ll === null ? { tom: 'info', texto: 'Sem cálculo' } : A.ll < 0 ? { tom: 'crit', texto: 'Prejuízo' } : tomMargem(A.ml, [0.1, 0.03]),
    },
    {
      chave: 'apropriar',
      titulo: 'Resultado a apropriar',
      valor_fmt: brl(c.margemApropriar),
      detalhe: [
        'receita a reconhecer ',
        { b: brl(c.aRecReceita - c.aRecSemOrcamento) },
        ' − custo a incorrer ',
        { b: brl(-c.custoAApropriar) },
        c.margemApropriarPct !== null ? ` · margem ${pct(c.margemApropriarPct * 100)}` : '',
      ],
      etiqueta:
        c.margemApropriarPct === null
          ? { tom: 'info', texto: 'Sem carteira a apropriar' }
          : c.margemApropriar < 0
            ? { tom: 'crit', texto: 'Margem negativa' }
            : c.margemApropriarPct >= 0.3
              ? { tom: 'good', texto: 'Margem garantida' }
              : c.margemApropriarPct >= 0.15
                ? { tom: 'info', texto: 'Margem adequada' }
                : { tom: 'warn', texto: 'Margem apertada' },
    },
    {
      chave: 'obra',
      titulo: 'Obra executada da carteira',
      valor_fmt: c.pocR === null ? '–' : pct(c.pocR * 100),
      detalhe: [{ b: pp(c.pocR === null || c.pocRIni === null ? null : c.pocR - c.pocRIni) }, ' no período · ', { b: brl(c.saldo) }, ' a executar'],
      etiqueta: c.pocR === null ? { tom: 'info', texto: 'Sem orçamento' } : c.pocR >= 0.85 ? { tom: 'info', texto: 'Fim de ciclo' } : c.pocR >= 0.4 ? { tom: 'good', texto: 'Em execução' } : { tom: 'info', texto: 'Início de obra' },
    },
    {
      chave: 'vendas',
      titulo: 'Vendas líquidas no período',
      valor_fmt: brl(c.vendasValor - c.distratosValor),
      detalhe: [{ b: `${c.vendasQtd} un` }, ' vendidas · ', { b: `${c.distratosQtd} un` }, ` distratadas (${brl(c.distratosValor)})`],
      etiqueta:
        c.vendasValor - c.distratosValor > 0 ? { tom: 'good', texto: 'Positivas' } : c.vendasValor === 0 ? { tom: 'warn', texto: 'Sem vendas' } : { tom: 'crit', texto: 'Distratos superam' },
    },
    {
      chave: 'estoque',
      titulo: 'Estoque a vender',
      valor_fmt: brl(c.estoqueValor),
      detalhe: [{ b: `${c.estoqueQtd} un` }, ` de ${c.unidades} · `, { b: c.vgv ? pct((c.estoqueValor / c.vgv) * 100) : '–' }, ' do VGV'],
      etiqueta: !c.vgv ? { tom: 'info', texto: 'Sem unidades' } : c.estoqueValor / c.vgv < 0.1 ? { tom: 'good', texto: 'Quase vendido' } : c.estoqueValor / c.vgv < 0.3 ? { tom: 'info', texto: 'Normal' } : { tom: 'warn', texto: 'Estoque alto' },
    },
  ];
  return tiles;
}

// "De cada R$ 100 que entraram": quanto foi para cada destino.
export function deCada100(F) {
  if (!F) return [];
  return F.col2.map((u) => ({ rotulo: u.rotulo, valor: (u.valor / F.entradas) * 100, tipo: u.tipo || null }));
}

// ─── Simulador ───────────────────────────────────────────────────────────────────────────────────
// Alavancas sobre a DRE do período, todas pela lógica da POC (nada é gravado):
//   vendas %    — muda as vendas novas do período: a receita delas (base nova × POC de Receita) e o custo
//                 que a fração vendida a mais carrega (base antiga × Δfração das linhas com POC de Despesa);
//   avanço p.p. — obra executada a mais: a receita já vendida reconhece mais (base × ΔPOC) e o custo gasto
//                 a mais entra no CIV pela fração vendida (o estorno devolve a parte distratada);
//   orçamento % — revisão do orçamento da obra: a POC cai (custo ÷ orçamento maior) e a receita reconhecida
//                 recua na mesma proporção;
//   estoque %   — vender agora parte do estoque (valor estimado): receita × POC de hoje e o custo dessa
//                 fração no CIV;
//   despesas %  — despesas sem POC entre o Lucro Bruto e o EBITDA (administrativas, comerciais…).
// O imposto fixo (RET) acompanha pela alíquota efetiva do período sobre o que está acima dele.
export const PRESETS = {
  base: { label: 'Realizado', vendas: 0, avanco: 0, orcamento: 0, estoque: 0, despesas: 0 },
  cons: { label: 'Conservador', vendas: -10, avanco: 0, orcamento: 2, estoque: 0, despesas: 5 },
  stress: { label: 'Estresse', vendas: -25, avanco: 0, orcamento: 5, estoque: 0, despesas: 10 },
  acel: { label: 'Aceleração', vendas: 0, avanco: 10, orcamento: 0, estoque: 25, despesas: 0 },
};
export const presetDe = (p) => Object.keys(PRESETS).find((k) => ['vendas', 'avanco', 'orcamento', 'estoque', 'despesas'].every((c) => PRESETS[k][c] === p[c])) || null;

// Alíquota efetiva de cada imposto fixo no período: imposto ÷ tudo o que está acima dele.
function aliquotasEfetivas(D) {
  const ordem = D.arvore.filter((g) => !g.totalizadora).flatMap((g) => g.filhos);
  const out = [];
  ordem.forEach((f, i) => {
    if (f.origem !== 'IMPOSTO_FIXO') return;
    const acima = ordem.slice(0, i).reduce((s, x) => s + (D.atual.valores[x.id] ?? 0), 0);
    out.push({ id: f.id, indice: i, taxa: acima ? (D.atual.valores[f.id] ?? 0) / acima : 0 });
  });
  return { ordem, impostos: out };
}

// Δ por máscara de uma alavanca (sem o imposto) → completa com o imposto fixo.
function comImposto(D, delta) {
  const { ordem, impostos } = D.rates;
  const out = { ...delta };
  impostos.forEach((imp) => {
    const acima = ordem.slice(0, imp.indice).reduce((s, f) => s + (out[f.id] ?? 0), 0);
    out[imp.id] = (out[imp.id] ?? 0) + imp.taxa * acima;
  });
  return out;
}
const somar = (a, id, v) => {
  if (v) a[id] = (a[id] ?? 0) + v;
};

function deltaVendas(D, x) {
  const d = {};
  if (!x) return d;
  const { obras, linhas, partes, ehVendas } = D.poc;
  obras.forEach((o) =>
    linhas.forEach((l) => {
      const p = o.foto.linhas[l.id];
      if (!p) return;
      if (ehVendas(l)) somar(d, l.id, x * partes(l, p).vendas);
      else if (l.tipo === 'DESPESA' && !l.estorno) somar(d, l.id, x * partes(l, p).vendas);
    })
  );
  return d;
}

// Avanço (fração de obra a mais) e revisão do orçamento (fração a mais) juntos: mexem na mesma POC.
function deltaObra(D, avanco, revisao) {
  const d = {};
  if (!avanco && !revisao) return d;
  const { obras, linhas, ehCiv, custoPoc } = D.poc;
  obras.forEach((o) => {
    if (!(o.orcamento > 0) || o.pocR === null) return;
    const orc2 = o.orcamento * (1 + revisao);
    const extra = Math.min(avanco * o.orcamento, Math.max(0, orc2 - o.custo));
    const poc2 = Math.min(1, (o.custo + extra) / orc2);
    const dpoc = poc2 - o.pocR;
    linhas.forEach((l) => {
      const p = o.foto.linhas[l.id];
      if (!p) return;
      if (l.tipo === 'RECEITA') somar(d, l.id, p.acumulado * dpoc);
    });
    if (extra > 0) {
      // O custo a mais entra no CIV pela fração vendida; o estorno devolve a parte distratada.
      const alvo = linhas.find((l) => l.id === custoPoc && ehCiv(l)) || linhas.find(ehCiv);
      const estorno = linhas.find((l) => l.estorno);
      if (alvo) somar(d, alvo.id, -extra * o.pocD);
      if (estorno) somar(d, estorno.id, extra * o.distratada);
    }
  });
  return d;
}

function deltaEstoque(D, x) {
  const d = {};
  if (!x) return d;
  const { obras, linhas, ehCiv } = D.poc;
  const vendas = linhas.find((l) => l.tipo === 'RECEITA' && l.calculo === 'VALOR_VENDAS');
  obras.forEach((o) => {
    // Obra sem orçamento fica de fora: a POC dela é 0 e a venda só traria custo (a falta é do cadastro).
    if (!o.un || !(o.un.estoque.valor > 0) || o.pocR === null || !(o.orcamento > 0)) return;
    if (vendas) somar(d, vendas.id, x * o.un.estoque.valor * o.pocR);
    linhas.filter(ehCiv).forEach((l) => {
      const p = o.foto.linhas[l.id];
      if (p) somar(d, l.id, p.acumulado * o.fracEstoque * x);
    });
  });
  return d;
}

function deltaDespesas(D, x) {
  const d = {};
  if (!x) return d;
  const i0 = D.arvore.indexOf(D.k.lucroBruto);
  if (i0 < 0) return d;
  const i1 = D.arvore.findIndex((g, i) => i > i0 && g.totalizadora);
  const comPoc = new Set(D.poc.linhas.map((l) => l.id));
  D.arvore.slice(i0 + 1, i1 < 0 ? undefined : i1).forEach((g) =>
    g.filhos.forEach((f) => {
      const v = D.atual.valores[f.id];
      if (v < 0 && !comPoc.has(f.id) && f.origem !== 'IMPOSTO_FIXO') somar(d, f.id, v * x);
    })
  );
  return d;
}

const somaDelta = (d) => Object.values(d).reduce((s, v) => s + v, 0);
function aplicar(D, delta) {
  const valores = { ...D.atual.valores };
  Object.entries(delta).forEach(([id, v]) => {
    if (valores[id] !== null && valores[id] !== undefined) valores[id] += v;
  });
  return indicadoresDe(D, valores);
}

export function simular(D, p) {
  const alavancas = [
    ['vendas', `Vendas do período ${p.vendas > 0 ? '+' : ''}${p.vendas}%`, comImposto(D, deltaVendas(D, p.vendas / 100))],
    ['avanco', `Obra +${p.avanco} p.p.`, comImposto(D, deltaObra(D, p.avanco / 100, 0))],
    ['orcamento', `Orçamento ${p.orcamento > 0 ? '+' : ''}${p.orcamento}%`, comImposto(D, deltaObra(D, 0, p.orcamento / 100))],
    ['estoque', `Vender ${p.estoque}% do estoque`, comImposto(D, deltaEstoque(D, p.estoque / 100))],
    ['despesas', `Despesas ${p.despesas > 0 ? '+' : ''}${p.despesas}%`, comImposto(D, deltaDespesas(D, p.despesas / 100))],
  ];
  // Total: avanço e orçamento juntos (a mesma POC); o resto soma.
  const total = {};
  [comImposto(D, deltaVendas(D, p.vendas / 100)), comImposto(D, deltaObra(D, p.avanco / 100, p.orcamento / 100)), comImposto(D, deltaEstoque(D, p.estoque / 100)), comImposto(D, deltaDespesas(D, p.despesas / 100))].forEach((d) =>
    Object.entries(d).forEach(([id, v]) => somar(total, id, v))
  );
  const contrib = alavancas.map(([chave, rotulo, d]) => ({ chave, rotulo, valor: somaDelta(d) })).filter((c) => Math.abs(c.valor) > 0.5);
  const interacao = somaDelta(total) - contrib.reduce((s, c) => s + c.valor, 0);
  if (Math.abs(interacao) > 0.5) contrib.push({ chave: 'interacao', rotulo: 'Obra × orçamento juntos', valor: interacao });
  return { base: D.atual, cen: aplicar(D, total), contrib };
}
