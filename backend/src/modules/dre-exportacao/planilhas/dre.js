const { CORES, borda, preencher, dataExcel, cabecalho, impressao } = require('../../../utils/excelMarca');
const { FMT, letra, rotuloCentro, rotuloMes, dataBr } = require('./comum');

// Abas "DRE" e "DRE Mensal" da exportação de auditoria: a DRE como a tela mostra (grupos de nível 1,
// linhas de nível 2 e totalizadoras), com cada linha de nível 2 em fórmula sobre a Memória de Cálculo
// (SOMASES pela linha — e pelo centro / mês). Na DRE, ao lado do consolidado do Excel, o valor do
// sistema e a diferença; nos centros, o valor e a AV %. Na DRE Mensal, os meses do período de um centro
// ou do consolidado (lista na célula C6). Grupo = soma das linhas dele; totalizadora = soma de todas as
// linhas acima, como na tela (DreTab.jsx::comAcumulado / totalDoGrupo): com alguma linha sem cálculo,
// traço.

const NOMES = { dre: 'DRE', mensal: 'DRE Mensal' };
const TODOS = 'Consolidado (todos os centros)';
const SIMBOLO = { IGUAL: '(=)', MAIS: '(+)', MENOS: '(−)', MAIS_MENOS: '(+/−)' };
const AZUL_TOTAL = 'FF174A70';
const TRACO = '—';

// Linhas da grade na ordem da tela, com a linha do Excel de cada uma (a partir de `primeira`).
function estrutura(arvore, primeira) {
  const linhas = [];
  let n = primeira;
  arvore.forEach((g) => {
    if (g.totalizadora) {
      linhas.push({ tipo: 'tot', grupo: g, n: n++ });
      return;
    }
    const n1 = { tipo: 'n1', grupo: g, n: n++, filhos: [] };
    linhas.push(n1);
    g.filhos.forEach((f) => {
      const l = { tipo: 'n2', grupo: g, item: f, n: n++ };
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
function valoresDaColuna(linhas, valores) {
  const v = new Map();
  linhas.forEach((l) => {
    if (l.tipo === 'n2') v.set(l, valores[l.item.id] ?? null);
  });
  linhas.forEach((l) => {
    if (l.tipo !== 'n1') return;
    const f = l.filhos.map((x) => v.get(x));
    v.set(l, f.length && f.every((x) => x !== null) ? f.reduce((t, x) => t + x, 0) : null);
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
    const a = l.filhos[0].n;
    const b = l.filhos[l.filhos.length - 1].n;
    return { formula: `SUM(${col}${a}:${col}${b})`, result: r };
  }
  return { formula: l.acima.length ? l.acima.map((g) => `${col}${g.n}`).join('+') : '0', result: r };
}

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

function escreverDre(workbook, sheet, d, C, meta) {
  const { resultado } = d;
  const MQ = C.lyMem.faixa('q');
  const MI = C.lyMem.faixa('mascara_id');
  const MA = C.lyMem.faixa('centro_id');
  const centros = resultado.por_centro;
  const PRIMEIRA = 8;
  const linhas = estrutura(d.arvore, PRIMEIRA);
  const ultimaLinha = linhas.length ? linhas[linhas.length - 1].n : PRIMEIRA;
  const ultimaCol = 7 + centros.length * 2;

  [5, 46, 24, 17, 9, 17, 12].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  centros.forEach((_, i) => {
    sheet.getColumn(8 + i * 2).width = 15;
    sheet.getColumn(9 + i * 2).width = 8;
  });
  cabecalho(workbook, sheet, {
    titulo: 'DRE — recalculada no Excel e conferida com o sistema',
    subtitulo:
      'Cada linha de nível 2 soma a Memória de Cálculo (todos os centros e meses; nas colunas dos centros, só o centro). "Sistema" = o que a aba DRE mostra; a Diferença tem de ser 0,00. Para abrir um número: Memória de Cálculo, filtre a Linha DRE (H) e o Centro (B).',
    filtros: meta.filtros,
    gerado: meta.gerado,
    ultimaColuna: ultimaCol,
  });

  // Cabeçalho da grade (2 linhas): DRE | Consolidado (Excel, AV %, Sistema, Diferença) | cada centro.
  cabecalhoGrade(sheet, 6, 1, 3, 'DRE');
  cabecalhoGrade(sheet, 6, 4, 7, 'CONSOLIDADO', { fill: CORES.AZUL });
  centros.forEach((c, i) => cabecalhoGrade(sheet, 6, 8 + i * 2, 9 + i * 2, rotuloCentro(c)));
  const sub = ['', 'Linha', 'Regra de cálculo', 'Valor (Excel)', 'AV %', 'Sistema', 'Diferença', ...centros.flatMap(() => ['Valor', 'AV %'])];
  sub.forEach((t, i) => cabecalhoGrade(sheet, 7, i + 1, i + 1, t, { fill: i >= 3 && i <= 6 ? CORES.AZUL : CORES.AZUL_ESCURO }));
  sheet.getRow(6).height = 30;
  sheet.getRow(7).height = 18;

  const sisConsolidado = valoresDaColuna(linhas, resultado.valores);
  const sisCentro = centros.map((c) => valoresDaColuna(linhas, c.valores));
  // AV %: a linha de nível 1 da aba Configurações vale 100%; ela e as de baixo mostram o percentual.
  const avId = resultado.avaliacao_vertical?.mascara_id;
  const base = linhas.find((l) => l.tipo !== 'n2' && l.grupo.id === avId) || null;
  const av = (row, l, col, valor, valorBase) => {
    const cel = row.getCell(col);
    if (!base || l.n < base.n) return;
    const L = letra(col - 1);
    cel.value = {
      formula: `IFERROR(${L}${l.n}/ABS(${L}$${base.n}),"")`,
      result: valor === null || !valorBase ? '' : valor / Math.abs(valorBase),
    };
    cel.numFmt = FMT.pct;
  };

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
    // Consolidado (Excel)
    const cons = row.getCell(4);
    cons.value = formulaDaLinha(l, 'D', (x) => `SUMIFS(${MQ},${MI},${x.item.id})`, sisConsolidado);
    cons.numFmt = FMT.moeda;
    cons.font = { ...e.font, bold: true };
    av(row, l, 5, sisConsolidado.get(l), base ? sisConsolidado.get(base) : null);
    // Sistema e diferença
    const sis = row.getCell(6);
    const vs = sisConsolidado.get(l);
    sis.value = vs === null ? TRACO : vs;
    sis.numFmt = FMT.moeda;
    const dif = row.getCell(7);
    dif.value = {
      formula: `IF(AND(ISNUMBER(D${l.n}),ISNUMBER(F${l.n})),ROUND(D${l.n}-F${l.n},2),IF(ISNUMBER(D${l.n})=ISNUMBER(F${l.n}),0,"≠"))`,
      result: 0,
    };
    dif.numFmt = FMT.diferenca;
    // Centros
    centros.forEach((c, i) => {
      const col = 8 + i * 2;
      const L = letra(col);
      const cel = row.getCell(col);
      cel.value = formulaDaLinha(l, L, (x) => `SUMIFS(${MQ},${MI},${x.item.id},${MA},${c.id})`, sisCentro[i]);
      cel.numFmt = FMT.moeda;
      av(row, l, col + 1, sisCentro[i].get(l), base ? sisCentro[i].get(base) : null);
    });
    pintar(row, 1, ultimaCol, l);
    for (let c = 3; c <= ultimaCol; c += 1) row.getCell(c).alignment = { horizontal: c === 3 ? 'left' : 'right', vertical: 'middle' };
    // Coluna do consolidado com fundo próprio nas linhas de nível 2.
    if (l.tipo === 'n2') for (let c = 4; c <= 7; c += 1) row.getCell(c).fill = preencher(CORES.AZUL_MUITO_CLARO);
    if (l.tipo === 'tot') totalBranco(row, ultimaCol);
  });

  // Conferência no rodapé: soma das diferenças absolutas (o "≠" conta à parte).
  const nConf = ultimaLinha + 2;
  const rot = sheet.getCell(nConf, 2);
  rot.value = 'Conferência: soma das diferenças |Excel − sistema|';
  rot.font = { bold: true, size: 9, color: { argb: CORES.AZUL_ESCURO } };
  const conf = sheet.getCell(nConf, 7);
  conf.value = { formula: `SUMIF(G${PRIMEIRA}:G${ultimaLinha},">0")-SUMIF(G${PRIMEIRA}:G${ultimaLinha},"<0")`, result: 0 };
  conf.numFmt = FMT.diferenca;
  conf.font = { bold: true, size: 10 };
  const notas = [
    'Como ler: grupos de nível 1 = soma das linhas deles; totalizadoras (=) = soma de todas as linhas acima, como na tela. Traço = linha sem cálculo.',
    `AV % = valor ÷ |${resultado.avaliacao_vertical?.descricao || 'linha base não configurada'}| (aba Configurações), da linha base para baixo.`,
    'Os valores do Excel são fórmulas: mexa numa base (ex.: um orçamento na Base Orçamento) e a DRE inteira recalcula — útil pra simular e pra provar a conta.',
  ];
  notas.forEach((t, i) => {
    const c = sheet.getCell(nConf + 2 + i, 2);
    c.value = t;
    c.font = { size: 9, italic: true, color: { argb: CORES.CINZA } };
  });

  sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 7, showGridLines: false }];
  impressao(sheet, '6:7');
  return { linhas, primeira: PRIMEIRA, ultima: ultimaLinha, conferencia: `G${nConf}` };
}

function escreverMensal(workbook, sheet, d, C, meta) {
  const { resultado, intervalos } = d;
  const MQ = C.lyMem.faixa('q');
  const MI = C.lyMem.faixa('mascara_id');
  const MC = C.lyMem.faixa('mes');
  const MB = C.lyMem.faixa('centro');
  const LINHA_MESES = 8;
  const PRIMEIRA = 9;
  const linhas = estrutura(d.arvore, PRIMEIRA);
  const nMeses = intervalos.length;
  const colTotal = 3 + nMeses;
  const colLista = colTotal + 2; // lista da célula C6 (oculta)

  sheet.getColumn(1).width = 5;
  sheet.getColumn(2).width = 46;
  for (let i = 0; i < nMeses; i += 1) sheet.getColumn(3 + i).width = 14;
  sheet.getColumn(colTotal).width = 17;
  cabecalho(workbook, sheet, {
    titulo: 'DRE mês a mês',
    subtitulo:
      'Escolha o centro de custo na lista da célula C6 (ou o consolidado): cada linha de nível 2 soma a Memória de Cálculo da linha, do mês e do centro. O total do período bate com a aba DRE.',
    filtros: meta.filtros,
    gerado: meta.gerado,
    ultimaColuna: colTotal,
  });

  // Seletor do centro.
  const r6 = sheet.getRow(6);
  r6.height = 22;
  const rotSel = r6.getCell(2);
  rotSel.value = 'Centro de custo (escolha na lista) ▸';
  rotSel.font = { bold: true, size: 10, color: { argb: CORES.AZUL_ESCURO } };
  rotSel.alignment = { horizontal: 'right', vertical: 'middle' };
  const fimSel = Math.min(colTotal, 6);
  if (fimSel > 3) sheet.mergeCells(6, 3, 6, fimSel);
  const sel = r6.getCell(3);
  sel.value = TODOS;
  sel.font = { bold: true, size: 10, color: { argb: CORES.PRETO } };
  sel.fill = preencher(CORES.AMARELO_CLARO);
  sel.alignment = { vertical: 'middle', indent: 1 };
  sel.border = { top: borda(CORES.AZUL), bottom: borda(CORES.AZUL), left: borda(CORES.AZUL), right: borda(CORES.AZUL) };
  const opcoes = [TODOS, ...resultado.por_centro.map((c) => rotuloCentro(c))];
  opcoes.forEach((o, i) => (sheet.getCell(PRIMEIRA + i, colLista).value = o));
  sheet.getColumn(colLista).hidden = true;
  const L = letra(colLista);
  sel.dataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: [`$${L}$${PRIMEIRA}:$${L}$${PRIMEIRA + opcoes.length - 1}`],
    showErrorMessage: true,
    errorTitle: 'Centro de custo',
    error: 'Escolha um centro da lista.',
  };

  // Cabeçalho dos meses (data do 1º dia, como a coluna Mês da Memória).
  cabecalhoGrade(sheet, LINHA_MESES, 1, 2, 'DRE');
  intervalos.forEach(([a], i) => {
    const c = sheet.getCell(LINHA_MESES, 3 + i);
    cabecalhoGrade(sheet, LINHA_MESES, 3 + i, 3 + i, '');
    c.value = dataExcel(`${a.slice(0, 7)}-01`);
    c.numFmt = 'mmm/yyyy';
  });
  cabecalhoGrade(sheet, LINHA_MESES, colTotal, colTotal, 'Total do período', { fill: CORES.AZUL });
  sheet.getRow(LINHA_MESES).height = 20;

  const criterio = `IF($C$6="${TODOS}","*",$C$6)`;
  const porMes = resultado.meses.map((x) => valoresDaColuna(linhas, x.valores));
  const total = valoresDaColuna(linhas, resultado.valores);
  linhas.forEach((l) => {
    const row = sheet.getRow(l.n);
    celulaRotulo(row, l);
    const e = ESTILO[l.tipo];
    intervalos.forEach((_, i) => {
      const col = 3 + i;
      const Lc = letra(col);
      const cel = row.getCell(col);
      cel.value = formulaDaLinha(l, Lc, (x) => `SUMIFS(${MQ},${MI},${x.item.id},${MC},${Lc}$${LINHA_MESES},${MB},${criterio})`, porMes[i]);
      cel.numFmt = FMT.moeda;
      cel.font = e.font;
    });
    const t = row.getCell(colTotal);
    const rt = total.get(l);
    t.value = rt === null ? TRACO : { formula: `SUM(C${l.n}:${letra(colTotal - 1)}${l.n})`, result: rt };
    t.numFmt = FMT.moeda;
    t.font = { ...e.font, bold: true };
    pintar(row, 1, colTotal, l);
    if (l.tipo === 'tot') totalBranco(row, colTotal);
    for (let c = 3; c <= colTotal; c += 1) row.getCell(c).alignment = { horizontal: 'right', vertical: 'middle' };
    if (l.tipo === 'n2') row.getCell(colTotal).fill = preencher(CORES.AZUL_MUITO_CLARO);
  });

  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: LINHA_MESES, showGridLines: false }];
  impressao(sheet, `${LINHA_MESES}:${LINHA_MESES}`);
  return { opcoes };
}

module.exports = { NOMES, TODOS, escreverDre, escreverMensal, rotuloPeriodo: (d) => `${dataBr(d.de)} a ${dataBr(d.ate)}`, rotuloMes };
