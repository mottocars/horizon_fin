const { CORES, borda, preencher, dataExcel, cabecalho, impressao } = require('../../../utils/excelMarca');
const { FMT, letra, rotuloCentro, rotuloMes, dataBr } = require('./comum');

// Abas "DRE" e "DRE Mensal" da exportação de auditoria: o ESPELHO da aba DRE da tela (grupos de nível 1,
// linhas de nível 2 e totalizadoras), com cada linha de nível 2 em fórmula sobre a Memória de Cálculo
// (SOMASES pela linha — e pelo centro / mês). Colunas como na tela: Valor e AV % (no mês a mês, só o
// Valor) e, havendo projeção, Projetado (SOMASES na Projeção Mensal — a foto do orçamento) e Desvio %
// = (Valor − Projetado) ÷ |Projetado|, com o projetado só dos meses até o atual e, no consolidado, o
// realizado só dos centros com projeção (DreTab.jsx). Grupo = soma das linhas dele; totalizadora = soma
// de todas as linhas acima (DreTab.jsx::comAcumulado); com alguma linha sem cálculo, traço. A
// conferência com o sistema fica na Memória de Cálculo (coluna Diferença) e no Roteiro.

const NOMES = { dre: 'DRE', mensal: 'DRE Mensal' };
const TODOS = 'Consolidado (todos os centros)';
const SIMBOLO = { IGUAL: '(=)', MAIS: '(+)', MENOS: '(−)', MAIS_MENOS: '(+/−)' };
const AZUL_TOTAL = 'FF174A70';
const AMARELO_PROJ = 'FFFDF6D3';
const TRACO = '—';
const TOLERANCIA = 0.1; // ±10%: neutro na tela
const ROTULO_SUB = { valor: 'Valor', pct: 'AV %', proj: 'Projetado', desvio: 'Desvio %' };
const num = (v) => (v === null || v === undefined ? 0 : Number(v));

// Linhas da grade na ordem da tela, com a linha do Excel de cada uma (a partir de `primeira`).
function estrutura(arvore, primeira) {
  const linhas = [];
  let n = primeira;
  arvore.forEach((g, gi) => {
    if (g.totalizadora) {
      linhas.push({ tipo: 'tot', grupo: g, ordemGrupo: gi + 1, n: n++ });
      return;
    }
    const n1 = { tipo: 'n1', grupo: g, ordemGrupo: gi + 1, n: n++, filhos: [] };
    linhas.push(n1);
    g.filhos.forEach((f) => {
      const l = { tipo: 'n2', grupo: g, ordemGrupo: gi + 1, item: f, n: n++ };
      n1.filhos.push(l);
      linhas.push(l);
    });
  });
  // Totalizadora: os grupos de nível 1 acima dela.
  linhas.forEach((l, i) => {
    if (l.tipo === 'tot') l.acima = linhas.slice(0, i).filter((x) => x.tipo === 'n1');
  });
  return linhas;
}

// Valor de cada linha numa coluna, a partir dos valores de nível 2 (null = sem cálculo): grupo = soma
// dos filhos (sem filhos ou com algum null, null); totalizadora = soma dos grupos acima (algum null, null).
// `zero`: linha de nível 2 sem valor vale 0 (o projetado nunca é traço).
function valoresDaColuna(linhas, valores, { zero = false } = {}) {
  const v = new Map();
  linhas.forEach((l) => {
    if (l.tipo === 'n2') v.set(l, valores[l.item.id] ?? (zero ? 0 : null));
  });
  linhas.forEach((l) => {
    if (l.tipo !== 'n1') return;
    const f = l.filhos.map((x) => v.get(x));
    v.set(l, f.length && f.every((x) => x !== null) ? f.reduce((t, x) => t + x, 0) : zero ? 0 : null);
  });
  linhas.forEach((l) => {
    if (l.tipo !== 'tot') return;
    const filhos = l.acima.flatMap((g) => g.filhos.map((x) => v.get(x)));
    v.set(l, filhos.every((x) => x !== null) ? filhos.reduce((t, x) => t + x, 0) : null);
  });
  return v;
}

// Fórmula da célula de uma linha na coluna `col` (letra). `n2(l)` = a fórmula da linha de nível 2.
function formulaDaLinha(l, col, n2, sistema) {
  const r = sistema.get(l);
  if (r === null) return TRACO;
  if (l.tipo === 'n2') return { formula: n2(l), result: r };
  if (l.tipo === 'n1') {
    if (!l.filhos.length) return { formula: '0', result: 0 };
    const a = l.filhos[0].n;
    const b = l.filhos[l.filhos.length - 1].n;
    return { formula: `SUM(${col}${a}:${col}${b})`, result: r };
  }
  return { formula: l.acima.length ? l.acima.map((g) => `${col}${g.n}`).join('+') : '0', result: r };
}

// Desvio % (fração): (realizado − projetado) ÷ |projetado|; sem projetado, vazio.
const desvio = (real, proj) => (proj ? (num(real) - proj) / Math.abs(proj) : '');

const ESTILO = {
  tot: { fill: AZUL_TOTAL, font: { bold: true, size: 10, color: { argb: CORES.BRANCO } }, altura: 19 },
  n1: { fill: CORES.AZUL_CLARO, font: { bold: true, size: 10, color: { argb: CORES.PRETO } }, altura: 17 },
  n2: { fill: CORES.BRANCO, font: { size: 9, color: { argb: CORES.CINZA_ESCURO } }, altura: 15 },
};

function celulaRotulo(row, l) {
  const e = ESTILO[l.tipo];
  const s = row.getCell(1);
  s.value = l.tipo === 'n2' ? '' : SIMBOLO[l.grupo.icone] || (l.tipo === 'tot' ? '(=)' : '');
  s.font = { ...e.font, size: 8 };
  s.alignment = { horizontal: 'center', vertical: 'middle' };
  const c = row.getCell(2);
  c.value = l.tipo === 'n2' ? l.item.descricao : l.grupo.descricao;
  c.font = e.font;
  c.alignment = { vertical: 'middle', indent: l.tipo === 'n2' ? 2 : 0 };
  row.height = e.altura;
}

function pintar(row, de, ate, l) {
  const e = ESTILO[l.tipo];
  for (let c = de; c <= ate; c += 1) {
    const cel = row.getCell(c);
    cel.fill = preencher(e.fill);
    cel.border = { bottom: borda(l.tipo === 'n2' ? CORES.CINZA_LINHA : CORES.CINZA_BORDA) };
    if (c > 2 && !cel.font) cel.font = e.font;
  }
}

// Totalizadora (fundo azul-escuro): tudo em branco, negativo só com o sinal — o vermelho não aparece
// no escuro.
const SEM_VERMELHO = { [FMT.moeda]: '#,##0.00;-#,##0.00', [FMT.diferenca]: '#,##0.00;-#,##0.00;0.00' };
function totalBranco(row, ate) {
  for (let c = 1; c <= ate; c += 1) {
    const cel = row.getCell(c);
    cel.font = { ...cel.font, color: { argb: CORES.BRANCO } };
    if (SEM_VERMELHO[cel.numFmt]) cel.numFmt = SEM_VERMELHO[cel.numFmt];
  }
}

function cabecalhoGrade(sheet, linha, de, ate, texto, { fill = CORES.AZUL_ESCURO } = {}) {
  if (ate > de) sheet.mergeCells(linha, de, linha, ate);
  const c = sheet.getCell(linha, de);
  c.value = texto;
  c.font = { bold: true, size: 9, color: { argb: CORES.BRANCO } };
  c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  for (let x = de; x <= ate; x += 1) {
    sheet.getCell(linha, x).fill = preencher(fill);
    sheet.getCell(linha, x).border = { left: borda(CORES.AZUL_ESCURO), right: borda(CORES.AZUL_ESCURO) };
  }
}

// Desvio % colorido como na tela: além de +10% verde, abaixo de −10% vermelho (no meio, neutro).
function coresDoDesvio(sheet, ref) {
  sheet.addConditionalFormatting({
    ref,
    rules: [
      { type: 'cellIs', operator: 'greaterThan', formulae: [String(TOLERANCIA)], style: { font: { color: { argb: 'FF047857' }, bold: true } } },
      { type: 'cellIs', operator: 'lessThan', formulae: [String(-TOLERANCIA)], style: { font: { color: { argb: 'FFB91C1C' }, bold: true } } },
    ],
  });
}

// Critérios do SOMASES de uma linha numa aba que tem as colunas da linha (mascara_id), do grupo
// (grupo_id) e da ordem do grupo: nível 2 pela linha, nível 1 pelo grupo, totalizadora pelos grupos acima.
function criterioDaLinha(l, faixa) {
  if (l.tipo === 'n2') return `${faixa('mascara_id')},${l.item.id}`;
  if (l.tipo === 'n1') return `${faixa('grupo_id')},${l.grupo.id}`;
  return `${faixa('ordem_grupo')},"<${l.ordemGrupo}"`;
}

function escreverDre(workbook, sheet, d, C, meta, J = null) {
  const { resultado } = d;
  const MQ = C.lyMem.faixa('q');
  const MI = C.lyMem.faixa('mascara_id');
  const MA = C.lyMem.faixa('centro_id');
  const centros = resultado.por_centro;
  const PRIMEIRA = 8;
  const linhas = estrutura(d.arvore, PRIMEIRA);
  const ultimaLinha = linhas.length ? linhas[linhas.length - 1].n : PRIMEIRA;
  const subs = J ? ['valor', 'pct', 'proj', 'desvio'] : ['valor', 'pct'];
  const S = subs.length;
  const colConsolidado = 4;
  const colCentro = (i) => colConsolidado + S * (i + 1);
  const ultimaCol = colConsolidado + S * (centros.length + 1) - 1;
  const pos = (base, sub) => base + subs.indexOf(sub);

  const LARG = { valor: 16, pct: 8, proj: 16, desvio: 9 };
  [5, 46, 24].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  [colConsolidado, ...centros.map((_, i) => colCentro(i))].forEach((b) => subs.forEach((s, k) => (sheet.getColumn(b + k).width = LARG[s])));
  cabecalho(workbook, sheet, {
    titulo: 'DRE — o espelho da aba DRE, recalculado no Excel',
    subtitulo: J
      ? 'Cada linha de nível 2 soma a Memória de Cálculo (todos os centros e meses; nas colunas dos centros, só o centro). Projetado = soma da Projeção Mensal (a foto do orçamento); Desvio % = (Valor − Projetado) ÷ |Projetado|, com o projetado só dos meses até o atual e, no consolidado, o realizado só dos centros com projeção. Para abrir um número: Memória de Cálculo / Memória Projeção, filtre a Linha DRE e o Centro.'
      : 'Cada linha de nível 2 soma a Memória de Cálculo (todos os centros e meses; nas colunas dos centros, só o centro). Para abrir um número: Memória de Cálculo, filtre a Linha DRE (H) e o Centro (B).',
    filtros: meta.filtros,
    gerado: meta.gerado,
    ultimaColuna: ultimaCol,
  });

  // Cabeçalho da grade (2 linhas): DRE | Consolidado | cada centro, com as subcolunas da tela.
  cabecalhoGrade(sheet, 6, 1, 3, 'DRE');
  cabecalhoGrade(sheet, 6, colConsolidado, colConsolidado + S - 1, 'CONSOLIDADO', { fill: CORES.AZUL });
  centros.forEach((c, i) => cabecalhoGrade(sheet, 6, colCentro(i), colCentro(i) + S - 1, rotuloCentro(c)));
  ['', 'Linha', 'Regra de cálculo'].forEach((t, i) => cabecalhoGrade(sheet, 7, i + 1, i + 1, t));
  [colConsolidado, ...centros.map((_, i) => colCentro(i))].forEach((b, bi) =>
    subs.forEach((s, k) => cabecalhoGrade(sheet, 7, b + k, b + k, ROTULO_SUB[s], { fill: bi === 0 ? CORES.AZUL : CORES.AZUL_ESCURO }))
  );
  sheet.getRow(6).height = 30;
  sheet.getRow(7).height = 18;

  const sisConsolidado = valoresDaColuna(linhas, resultado.valores);
  const sisCentro = centros.map((c) => valoresDaColuna(linhas, c.valores));
  // AV %: a linha de nível 1 da aba Configurações vale 100%; ela e as de baixo mostram o percentual.
  const avId = resultado.avaliacao_vertical?.mascara_id;
  const base = linhas.find((l) => l.tipo !== 'n2' && l.grupo.id === avId) || null;
  const av = (row, l, col, colValor, valor, valorBase) => {
    const cel = row.getCell(col);
    if (!base || l.n < base.n) return;
    const L = letra(colValor);
    cel.value = {
      formula: `IFERROR(${L}${l.n}/ABS(${L}$${base.n}),"")`,
      result: valor === null || !valorBase ? '' : valor / Math.abs(valorBase),
    };
    cel.numFmt = FMT.pct;
  };

  // Projeção: valores (resultado das fórmulas) do consolidado e de cada centro com projeção.
  const projetos = J
    ? (() => {
        const { somaFoto } = require('./projecao');
        const comp = (x) => x.comparavel === 'Sim';
        const PF = (k) => J.lyMensal.faixa(k);
        const porCentro = centros.map((c) =>
          J.centros.has(c.id)
            ? {
                proj: valoresDaColuna(linhas, somaFoto(J, c.id), { zero: true }),
                comp: valoresDaColuna(linhas, somaFoto(J, c.id, comp), { zero: true }),
              }
            : null
        );
        return {
          PF,
          porCentro,
          proj: valoresDaColuna(linhas, somaFoto(J, null), { zero: true }),
          comp: valoresDaColuna(linhas, somaFoto(J, null, comp), { zero: true }),
          comProj: centros.map((c, i) => (J.centros.has(c.id) ? i : -1)).filter((i) => i >= 0),
        };
      })()
    : null;

  linhas.forEach((l) => {
    const row = sheet.getRow(l.n);
    celulaRotulo(row, l);
    const e = ESTILO[l.tipo];
    if (l.tipo === 'n2') {
      const regra = d.regras.get(l.item.id);
      const r = row.getCell(3);
      r.value = regra?.tipo === 'RET' ? 'Imposto fixo (RET)' : regra?.curto || '';
      r.font = { size: 8, italic: true, color: { argb: CORES.CINZA } };
    }
    // Consolidado
    const cV = pos(colConsolidado, 'valor');
    const cons = row.getCell(cV);
    cons.value = formulaDaLinha(l, letra(cV), (x) => `SUMIFS(${MQ},${MI},${x.item.id})`, sisConsolidado);
    cons.numFmt = FMT.moeda;
    cons.font = { ...e.font, bold: true };
    av(row, l, pos(colConsolidado, 'pct'), cV, sisConsolidado.get(l), base ? sisConsolidado.get(base) : null);
    if (projetos) {
      const { PF } = projetos;
      const cP = pos(colConsolidado, 'proj');
      const p = row.getCell(cP);
      p.value = formulaDaLinha(l, letra(cP), (x) => `SUMIFS(${PF('valor')},${PF('mascara_id')},${x.item.id})`, projetos.proj);
      p.numFmt = FMT.moeda;
      // Desvio do consolidado: o realizado só dos centros com projeção (as colunas Valor deles).
      const real = projetos.comProj.map((i) => `${letra(pos(colCentro(i), 'valor'))}${l.n}`);
      const compF = `SUMIFS(${PF('valor')},${criterioDaLinha(l, PF)},${PF('comparavel')},"Sim")`;
      const realR = projetos.comProj.reduce((t, i) => t + num(sisCentro[i].get(l)), 0);
      const dv = row.getCell(pos(colConsolidado, 'desvio'));
      dv.value = { formula: `IFERROR((${real.length ? real.join('+') : '0'}-${compF})/ABS(${compF}),"")`, result: desvio(realR, projetos.comp.get(l)) };
      dv.numFmt = FMT.pct;
    }
    // Centros
    centros.forEach((c, i) => {
      const b = colCentro(i);
      const cv = pos(b, 'valor');
      const L = letra(cv);
      const cel = row.getCell(cv);
      cel.value = formulaDaLinha(l, L, (x) => `SUMIFS(${MQ},${MI},${x.item.id},${MA},${c.id})`, sisCentro[i]);
      cel.numFmt = FMT.moeda;
      av(row, l, pos(b, 'pct'), cv, sisCentro[i].get(l), base ? sisCentro[i].get(base) : null);
      if (!projetos) return;
      const pc = projetos.porCentro[i];
      const cp = pos(b, 'proj');
      const p = row.getCell(cp);
      const dv = row.getCell(pos(b, 'desvio'));
      if (!pc) {
        p.value = TRACO;
        dv.value = '';
        return;
      }
      const { PF } = projetos;
      p.value = formulaDaLinha(l, letra(cp), (x) => `SUMIFS(${PF('valor')},${PF('mascara_id')},${x.item.id},${PF('centro_id')},${c.id})`, pc.proj);
      p.numFmt = FMT.moeda;
      const compF = `SUMIFS(${PF('valor')},${criterioDaLinha(l, PF)},${PF('centro_id')},${c.id},${PF('comparavel')},"Sim")`;
      dv.value = { formula: `IFERROR((${L}${l.n}-${compF})/ABS(${compF}),"")`, result: desvio(sisCentro[i].get(l), pc.comp.get(l)) };
      dv.numFmt = FMT.pct;
    });
    pintar(row, 1, ultimaCol, l);
    for (let c = 3; c <= ultimaCol; c += 1) row.getCell(c).alignment = { horizontal: c === 3 ? 'left' : 'right', vertical: 'middle' };
    if (l.tipo === 'n2') {
      // Consolidado com fundo próprio; Projetado em amarelo pastel (como na tela).
      for (let c = colConsolidado; c < colConsolidado + S; c += 1) row.getCell(c).fill = preencher(CORES.AZUL_MUITO_CLARO);
      if (projetos) [colConsolidado, ...centros.map((_, i) => colCentro(i))].forEach((b) => (row.getCell(pos(b, 'proj')).fill = preencher(AMARELO_PROJ)));
    }
    if (l.tipo === 'tot') totalBranco(row, ultimaCol);
  });
  if (projetos) {
    [colConsolidado, ...centros.map((_, i) => colCentro(i))].forEach((b) => {
      const L = letra(pos(b, 'desvio'));
      coresDoDesvio(sheet, `${L}${PRIMEIRA}:${L}${ultimaLinha}`);
    });
  }

  // Conferência no rodapé: consolidado = soma dos centros, linha a linha (soma das diferenças absolutas).
  const nConf = ultimaLinha + 2;
  const rot = sheet.getCell(nConf, 2);
  rot.value = 'Conferência: consolidado − soma dos centros (cada linha de nível 2)';
  rot.font = { bold: true, size: 9, color: { argb: CORES.AZUL_ESCURO } };
  const cV = letra(pos(colConsolidado, 'valor'));
  const de = letra(colCentro(0));
  const ate = letra(ultimaCol);
  const termos = centros.length
    ? linhas
        .filter((l) => l.tipo === 'n2' && sisConsolidado.get(l) !== null)
        .map((l) => `ABS(${cV}${l.n}-SUMIF($${de}$7:$${ate}$7,"Valor",$${de}${l.n}:$${ate}${l.n}))`)
    : [];
  const conf = sheet.getCell(nConf, pos(colConsolidado, 'valor'));
  conf.value = { formula: termos.length ? termos.join('+') : '0', result: 0 };
  conf.numFmt = FMT.diferenca;
  conf.font = { bold: true, size: 10 };
  const notas = [
    'Como ler: grupos de nível 1 = soma das linhas deles; totalizadoras (=) = soma de todas as linhas acima, como na tela. Traço = linha sem cálculo.',
    `AV % = valor ÷ |${resultado.avaliacao_vertical?.descricao || 'linha base não configurada'}| (aba Configurações), da linha base para baixo.`,
    ...(J
      ? [
          `Projetado / Desvio %: ${J.P.fonte === 'versao' ? `Versão ${J.P.versao?.numero ?? '—'}` : 'rascunhos + última versão'} (abas Projeção…). Desvio verde acima de +10%, vermelho abaixo de −10%, neutro no meio. Centro sem orçamento: traço no Projetado.`,
        ]
      : []),
    'Os valores do Excel são fórmulas: mexa numa base (ex.: um orçamento na Base Orçamento) e a DRE inteira recalcula — útil pra simular e pra provar a conta.',
  ];
  notas.forEach((t, i) => {
    const c = sheet.getCell(nConf + 2 + i, 2);
    c.value = t;
    c.font = { size: 9, italic: true, color: { argb: CORES.CINZA } };
  });

  sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 7, showGridLines: false }];
  impressao(sheet, '6:7');
  return { linhas, primeira: PRIMEIRA, ultima: ultimaLinha, conferencia: `${cV}${nConf}` };
}

function escreverMensal(workbook, sheet, d, C, meta, J = null) {
  const { resultado, intervalos } = d;
  const MQ = C.lyMem.faixa('q');
  const MI = C.lyMem.faixa('mascara_id');
  const MC = C.lyMem.faixa('mes');
  const MB = C.lyMem.faixa('centro');
  const MP = C.lyMem.faixa('com_projecao');
  const MF = (k) => C.lyMem.faixa(k);
  const LINHA_DATAS = 7; // oculta: o mês de cada coluna (as fórmulas usam)
  const LINHA_MESES = 8;
  const LINHA_SUB = 9;
  const PRIMEIRA = 10;
  const linhas = estrutura(d.arvore, PRIMEIRA);
  const mesAtual = J ? J.P.mesAtual : new Date().toISOString().slice(0, 7);

  // Colunas: cada mês com as subcolunas (com projeção: Valor, Projetado, Desvio %; mês futuro, só o
  // Projetado — como na tela) e o Total do período.
  const blocos = [];
  let col = 3;
  intervalos.forEach(([a], i) => {
    const mes = a.slice(0, 7);
    const subs = J ? (mes > mesAtual ? ['proj'] : ['valor', 'proj', 'desvio']) : ['valor'];
    blocos.push({ i, mes, data: `${mes}-01`, subs, col });
    col += subs.length;
  });
  const total = { subs: J ? ['valor', 'proj', 'desvio'] : ['valor'], col };
  const ultimaCol = col + total.subs.length - 1;
  const colLista = ultimaCol + 2; // lista da célula C6 (oculta)
  const colTrava = colLista + 1; // trava de cada opção (oculta)
  const pos = (b, s) => b.col + b.subs.indexOf(s);
  const ultimaMes = total.col - 1;

  sheet.getColumn(1).width = 5;
  sheet.getColumn(2).width = 46;
  blocos.forEach((b) => b.subs.forEach((s, k) => (sheet.getColumn(b.col + k).width = s === 'desvio' ? 9 : 14)));
  total.subs.forEach((s, k) => (sheet.getColumn(total.col + k).width = s === 'desvio' ? 9 : 17));
  cabecalho(workbook, sheet, {
    titulo: 'DRE mês a mês',
    subtitulo: J
      ? 'Escolha o centro de custo na lista da célula C6 (ou o consolidado): cada linha de nível 2 soma a Memória de Cálculo da linha, do mês e do centro; o Projetado soma a Projeção Mensal (meses até a trava do centro em cinza: é o realizado da data do orçamento); Desvio % = (Valor − Projetado) ÷ |Projetado| (consolidado: realizado só dos centros com projeção). Mês futuro: só o Projetado.'
      : 'Escolha o centro de custo na lista da célula C6 (ou o consolidado): cada linha de nível 2 soma a Memória de Cálculo da linha, do mês e do centro. O total do período bate com a aba DRE.',
    filtros: meta.filtros,
    gerado: meta.gerado,
    ultimaColuna: ultimaCol,
  });

  // Seletor do centro.
  const r6 = sheet.getRow(6);
  r6.height = 22;
  const rotSel = r6.getCell(2);
  rotSel.value = 'Centro de custo (escolha na lista) ▸';
  rotSel.font = { bold: true, size: 10, color: { argb: CORES.AZUL_ESCURO } };
  rotSel.alignment = { horizontal: 'right', vertical: 'middle' };
  const fimSel = Math.min(ultimaCol, 6);
  if (fimSel > 3) sheet.mergeCells(6, 3, 6, fimSel);
  const sel = r6.getCell(3);
  sel.value = TODOS;
  sel.font = { bold: true, size: 10, color: { argb: CORES.PRETO } };
  sel.fill = preencher(CORES.AMARELO_CLARO);
  sel.alignment = { vertical: 'middle', indent: 1 };
  sel.border = { top: borda(CORES.AZUL), bottom: borda(CORES.AZUL), left: borda(CORES.AZUL), right: borda(CORES.AZUL) };
  const opcoes = [TODOS, ...resultado.por_centro.map((c) => rotuloCentro(c))];
  opcoes.forEach((o, i) => {
    sheet.getCell(PRIMEIRA + i, colLista).value = o;
    const c = resultado.por_centro[i - 1];
    const trava = c && J?.centros.get(c.id)?.trava;
    if (trava) sheet.getCell(PRIMEIRA + i, colTrava).value = dataExcel(`${trava}-01`);
  });
  sheet.getColumn(colLista).hidden = true;
  sheet.getColumn(colTrava).hidden = true;
  const LL = letra(colLista);
  const LT = letra(colTrava);
  const listaRef = `$${LL}$${PRIMEIRA}:$${LL}$${PRIMEIRA + opcoes.length - 1}`;
  const travaRef = `$${LL}$${PRIMEIRA}:$${LT}$${PRIMEIRA + opcoes.length - 1}`;
  sel.dataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: [listaRef],
    showErrorMessage: true,
    errorTitle: 'Centro de custo',
    error: 'Escolha um centro da lista.',
  };

  // Cabeçalho: o mês (mesclado nas subcolunas), as subcolunas e, oculta, a data do mês em cada coluna.
  cabecalhoGrade(sheet, LINHA_MESES, 1, 2, 'DRE');
  cabecalhoGrade(sheet, LINHA_SUB, 1, 2, '');
  blocos.forEach((b) => {
    cabecalhoGrade(sheet, LINHA_MESES, b.col, b.col + b.subs.length - 1, '');
    const c = sheet.getCell(LINHA_MESES, b.col);
    c.value = dataExcel(b.data);
    c.numFmt = 'mmm/yyyy';
    b.subs.forEach((s, k) => {
      cabecalhoGrade(sheet, LINHA_SUB, b.col + k, b.col + k, ROTULO_SUB[s]);
      sheet.getCell(LINHA_DATAS, b.col + k).value = dataExcel(b.data);
    });
  });
  cabecalhoGrade(sheet, LINHA_MESES, total.col, ultimaCol, 'Total do período', { fill: CORES.AZUL });
  total.subs.forEach((s, k) => cabecalhoGrade(sheet, LINHA_SUB, total.col + k, total.col + k, ROTULO_SUB[s], { fill: CORES.AZUL }));
  sheet.getRow(LINHA_MESES).height = 20;
  sheet.getRow(LINHA_SUB).height = 16;
  sheet.getRow(LINHA_DATAS).hidden = true;

  const criterio = `IF($C$6="${TODOS}","*",$C$6)`;
  // Realizado do Desvio no consolidado: só os centros com projeção.
  const critProj = `IF($C$6="${TODOS}","Sim","*")`;
  const porMes = resultado.meses.map((x) => valoresDaColuna(linhas, x.valores));
  const totalSis = valoresDaColuna(linhas, resultado.valores);

  // Resultados da projeção (o consolidado, a opção que abre selecionada).
  const proj = J
    ? (() => {
        const { somaFoto } = require('./projecao');
        const comProj = resultado.por_centro.filter((c) => J.centros.has(c.id));
        const realDesvio = (iMes) => {
          const v = {};
          comProj.forEach((c) => {
            const vs = iMes === null ? c.valores : c.meses?.[iMes]?.valores || {};
            Object.entries(vs).forEach(([k, x]) => (v[k] = (v[k] || 0) + num(x)));
          });
          return valoresDaColuna(linhas, v, { zero: true });
        };
        return {
          PF: (k) => J.lyMensal.faixa(k),
          mes: blocos.map((b) => valoresDaColuna(linhas, somaFoto(J, null, (x) => x.mes === b.data), { zero: true })),
          real: blocos.map((b) => realDesvio(b.i)),
          total: valoresDaColuna(linhas, somaFoto(J, null), { zero: true }),
          comp: valoresDaColuna(linhas, somaFoto(J, null, (x) => x.comparavel === 'Sim'), { zero: true }),
          realTotal: realDesvio(null),
        };
      })()
    : null;

  linhas.forEach((l) => {
    const row = sheet.getRow(l.n);
    celulaRotulo(row, l);
    const e = ESTILO[l.tipo];
    const realF = (extra) => `SUMIFS(${MQ},${criterioDaLinha(l, MF)}${extra},${MB},${criterio},${MP},${critProj})`;
    blocos.forEach((b, bi) => {
      const Ld = (c) => `${letra(c)}$${LINHA_DATAS}`;
      if (b.subs.includes('valor')) {
        const c = pos(b, 'valor');
        const cel = row.getCell(c);
        cel.value = formulaDaLinha(l, letra(c), (x) => `SUMIFS(${MQ},${MI},${x.item.id},${MC},${Ld(c)},${MB},${criterio})`, porMes[b.i]);
        cel.numFmt = FMT.moeda;
        cel.font = e.font;
      }
      if (proj && b.subs.includes('proj')) {
        const c = pos(b, 'proj');
        const { PF } = proj;
        const cel = row.getCell(c);
        cel.value = formulaDaLinha(
          l,
          letra(c),
          (x) => `SUMIFS(${PF('valor')},${PF('mascara_id')},${x.item.id},${PF('mes')},${Ld(c)},${PF('centro')},${criterio})`,
          proj.mes[bi]
        );
        cel.numFmt = FMT.moeda;
        cel.font = e.font;
      }
      if (proj && b.subs.includes('desvio')) {
        const c = pos(b, 'desvio');
        const P = `${letra(pos(b, 'proj'))}${l.n}`;
        const real = realF(`,${MC},${Ld(c)}`);
        row.getCell(c).value = { formula: `IFERROR((${real}-${P})/ABS(${P}),"")`, result: desvio(proj.real[bi].get(l), proj.mes[bi].get(l)) };
        row.getCell(c).numFmt = FMT.pct;
      }
    });
    // Total do período: soma das subcolunas do mesmo tipo (SOMASE pelo rótulo da linha 9).
    const faixaMeses = (r) => `$C${r}:$${letra(ultimaMes)}${r}`;
    const somaSub = (rotulo) => `SUMIF($C$${LINHA_SUB}:$${letra(ultimaMes)}$${LINHA_SUB},"${rotulo}",${faixaMeses(l.n)})`;
    const tV = row.getCell(pos(total, 'valor'));
    const rt = totalSis.get(l);
    tV.value = rt === null ? TRACO : { formula: somaSub('Valor'), result: rt };
    tV.numFmt = FMT.moeda;
    tV.font = { ...e.font, bold: true };
    if (proj) {
      const tP = row.getCell(pos(total, 'proj'));
      tP.value = { formula: somaSub('Projetado'), result: proj.total.get(l) };
      tP.numFmt = FMT.moeda;
      tP.font = { ...e.font, bold: true };
      const { PF } = proj;
      const compF = `SUMIFS(${PF('valor')},${criterioDaLinha(l, PF)},${PF('centro')},${criterio},${PF('comparavel')},"Sim")`;
      const tD = row.getCell(pos(total, 'desvio'));
      tD.value = { formula: `IFERROR((${realF('')}-${compF})/ABS(${compF}),"")`, result: desvio(proj.realTotal.get(l), proj.comp.get(l)) };
      tD.numFmt = FMT.pct;
    }
    pintar(row, 1, ultimaCol, l);
    if (l.tipo === 'tot') totalBranco(row, ultimaCol);
    for (let c = 3; c <= ultimaCol; c += 1) row.getCell(c).alignment = { horizontal: 'right', vertical: 'middle' };
    if (l.tipo === 'n2') {
      for (let c = total.col; c <= ultimaCol; c += 1) row.getCell(c).fill = preencher(CORES.AZUL_MUITO_CLARO);
      if (proj) [...blocos, total].forEach((b) => b.subs.includes('proj') && (row.getCell(pos(b, 'proj')).fill = preencher(AMARELO_PROJ)));
    }
  });

  if (proj) {
    const ult = linhas.length ? linhas[linhas.length - 1].n : PRIMEIRA;
    [...blocos, total].forEach((b) => {
      if (!b.subs.includes('desvio')) return;
      const L = letra(pos(b, 'desvio'));
      coresDoDesvio(sheet, `${L}${PRIMEIRA}:${L}${ult}`);
    });
    // Mês até a trava do centro escolhido: o projetado é o realizado da data do orçamento (cinza).
    blocos.forEach((b) => {
      const L = letra(pos(b, 'proj'));
      const trava = `VLOOKUP($C$6,${travaRef},2,FALSE)`;
      sheet.addConditionalFormatting({
        ref: `${L}${PRIMEIRA}:${L}${ult}`,
        rules: [
          {
            type: 'expression',
            formulae: [`AND(ISNUMBER(${trava}),${L}$${LINHA_DATAS}<=${trava})`],
            style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: CORES.CINZA_CLARO } }, font: { color: { argb: CORES.CINZA } } },
          },
        ],
      });
    });
  }

  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: LINHA_SUB, showGridLines: false }];
  impressao(sheet, `${LINHA_MESES}:${LINHA_SUB}`);
  return { opcoes };
}

module.exports = { NOMES, TODOS, escreverDre, escreverMensal, rotuloPeriodo: (d) => `${dataBr(d.de)} a ${dataBr(d.ate)}`, rotuloMes };
