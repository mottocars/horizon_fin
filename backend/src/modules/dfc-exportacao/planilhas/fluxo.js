const { CORES, borda, preencher, cabecalho, impressao } = require('../../../utils/excelMarca');

// Aba "Fluxo de Caixa": o espelho da aba DFC (dfc-fluxo::montar). Contas com o valor; máscara 2,
// ENTRADAS/SAÍDAS, máscara 1 e Resultado são fórmulas de soma (dá pra simular mexendo numa conta);
// Saldo final projetado = inicial + resultado, e o inicial do mês seguinte puxa o final do anterior.
// Meses fechados do Realizado mantêm o saldo real do banco (valor, não fórmula). Linhas agrupadas
// com o contorno do Excel (botões 1-4).
// Desvio % (como na tela): em cada mês com Realizado, depois do Projetado — fórmula viva
// (Realizado − Projetado) ÷ |Projetado|; positivo = melhor para o caixa; vazio sem projetado.

const MESES_CAB = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const FORMATO = '#,##0;[Red]-#,##0;""'; // sem casas, negativo vermelho, zero em branco (como na tela)
const FORMATO_DESVIO = '[Color10]+0.0%;[Red]-0.0%;0.0%'; // verde positivo, vermelho negativo
const ROXO = 'FF6366F1';
const valorDe = (v) => (v && typeof v === 'object' ? v.result : v) || 0;
const LINHA_MESES = 6;
const LINHA_TIPOS = 7;

const ESTILO = {
  saldo: { font: { bold: true, size: 10, color: { argb: CORES.PRETO } }, fill: CORES.SLATE, altura: 20 },
  resultado: { font: { bold: true, size: 10, color: { argb: CORES.PRETO } }, fill: CORES.BRANCO, altura: 20 },
  n1: { font: { bold: true, size: 10, color: { argb: CORES.PRETO } }, fill: CORES.AZUL_MUITO_CLARO, altura: 18 },
  lado: { font: { bold: true, size: 8, color: { argb: CORES.CINZA } }, fill: CORES.BRANCO, altura: 15 },
  n2: { font: { size: 9, color: { argb: CORES.CINZA_ESCURO } }, fill: CORES.BRANCO, altura: 15 },
  conta: { font: { size: 9, color: { argb: CORES.CINZA } }, fill: CORES.BRANCO, altura: 15 },
};
const NIVEL = { n1: 0, lado: 1, n2: 2, conta: 3 };

module.exports = function planilhaFluxo(workbook, d, meta) {
  const f = d.fluxo;
  // Colunas desta aba: as do fluxo + o Desvio % logo depois do Projetado de cada mês com Realizado.
  const colunas = f.colunas.flatMap((c) => (c.tipo === 'P' && c.mes <= f.mesAtual ? [c, { mes: c.mes, tipo: 'D' }] : [c]));
  const sheet = workbook.addWorksheet('Fluxo de Caixa', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: LINHA_TIPOS, showGridLines: false }],
    properties: { outlineProperties: { summaryBelow: false, summaryRight: false } },
  });
  const ultima = 1 + colunas.length;
  sheet.properties.outlineLevelRow = 3; // botões 1-4 do contorno
  sheet.getColumn(1).width = 58;
  colunas.forEach((c, i) => (sheet.getColumn(i + 2).width = c.tipo === 'D' ? 10 : 14));
  cabecalho(workbook, sheet, {
    titulo: 'Fluxo de Caixa',
    subtitulo:
      'Realizado: extrato das contas com Projeta DFC (rateio por centro e natureza). Projetado: versão salva do Orçamento. Desvio % = (Realizado − Projetado) ÷ |Projetado| (positivo = melhor para o caixa; mês atual: realizado até hoje). Botões 1-4 à esquerda recolhem os níveis.',
    filtros: meta.filtros,
    gerado: meta.gerado,
    ultimaColuna: ultima,
  });

  const colDe = new Map(colunas.map((c, i) => [`${c.mes}|${c.tipo}`, i + 2]));
  const letra = (col) => sheet.getColumn(col).letter;
  const inicioDeMes = (i) => i === 0 || colunas[i - 1].mes !== colunas[i].mes;

  // Cabeçalho da grade: mês (mesclado sobre Realizado/Projetado) e o tipo.
  const cA = sheet.getCell(LINHA_MESES, 1);
  sheet.mergeCells(LINHA_MESES, 1, LINHA_TIPOS, 1);
  cA.value = 'FLUXO DE CAIXA';
  cA.font = { bold: true, size: 9, color: { argb: CORES.CINZA } };
  cA.alignment = { vertical: 'bottom', horizontal: 'left', indent: 1 };
  cA.border = { bottom: borda(CORES.CINZA_BORDA) };
  f.meses.forEach((m) => {
    const cols = colunas.map((c, i) => [c, i + 2]).filter(([c]) => c.mes === m);
    const de = cols[0][1];
    const ate = cols[cols.length - 1][1];
    if (ate > de) sheet.mergeCells(LINHA_MESES, de, LINHA_MESES, ate);
    const atual = m === f.mesAtual;
    const c = sheet.getCell(LINHA_MESES, de);
    c.value = {
      richText: [
        { text: MESES_CAB[Number(m.slice(5, 7)) - 1], font: { bold: true, size: 10, color: { argb: atual ? CORES.AZUL : CORES.CINZA_ESCURO } } },
        { text: `/${m.slice(0, 4)}`, font: { size: 8, color: { argb: atual ? CORES.AZUL : CORES.CINZA } } },
      ],
    };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
    for (let col = de; col <= ate; col += 1) {
      const cel = sheet.getCell(LINHA_MESES, col);
      cel.fill = preencher(atual ? CORES.AZUL_CLARO : CORES.BRANCO);
      cel.border = { left: col === de ? borda(CORES.CINZA_BORDA) : undefined };
    }
  });
  colunas.forEach((c, i) => {
    const cel = sheet.getCell(LINHA_TIPOS, i + 2);
    const atual = c.mes === f.mesAtual;
    cel.value = c.tipo === 'R' ? 'REALIZADO' : c.tipo === 'P' ? 'PROJETADO' : 'DESVIO %';
    cel.font = { bold: true, size: 8, color: { argb: c.tipo === 'R' ? CORES.TEAL : c.tipo === 'D' ? ROXO : CORES.CINZA } };
    cel.alignment = { vertical: 'middle', horizontal: 'center' };
    cel.fill = preencher(atual ? CORES.AZUL_CLARO : CORES.BRANCO);
    cel.border = {
      left: inicioDeMes(i) ? borda(CORES.CINZA_BORDA) : undefined,
      bottom: atual ? borda(CORES.AZUL, 'medium') : borda(CORES.CINZA_BORDA),
    };
  });
  sheet.getRow(LINHA_MESES).height = 20;
  sheet.getRow(LINHA_TIPOS).height = 16;

  let linha = LINHA_TIPOS + 1;
  // Uma linha da grade. `valor(coluna, k)` devolve número, { formula, result } ou null.
  const escrever = (tipo, rotulo, valor, { separar = false } = {}) => {
    const e = ESTILO[tipo];
    const row = sheet.getRow(linha);
    row.height = e.altura;
    if (tipo in NIVEL && NIVEL[tipo] > 0) row.outlineLevel = NIVEL[tipo];
    const r = row.getCell(1);
    r.value = rotulo;
    r.font = e.font;
    r.fill = preencher(e.fill);
    r.alignment = { vertical: 'middle', horizontal: 'left', indent: tipo === 'saldo' || tipo === 'resultado' ? 1 : (NIVEL[tipo] ?? 0) * 2 + 1 };
    r.border = { bottom: borda(), top: separar ? borda(CORES.CINZA_ESCURO) : undefined };
    const valores = new Map();
    colunas.forEach((c, i) => {
      if (c.tipo !== 'D') valores.set(`${c.mes}|${c.tipo}`, valor(c, `${c.mes}|${c.tipo}`, i + 2));
    });
    colunas.forEach((c, i) => {
      const col = i + 2;
      const cel = row.getCell(col);
      if (c.tipo === 'D') {
        // Desvio % sobre as duas células da mesma linha (N() trata a célula vazia como zero).
        const rc = `${letra(colDe.get(`${c.mes}|R`))}${linha}`;
        const pc = `${letra(colDe.get(`${c.mes}|P`))}${linha}`;
        const real = valorDe(valores.get(`${c.mes}|R`));
        const proj = valorDe(valores.get(`${c.mes}|P`));
        cel.value = {
          formula: `IF(N(${pc})=0,"",(N(${rc})-N(${pc}))/ABS(N(${pc})))`,
          result: proj ? (real - proj) / Math.abs(proj) : '',
        };
        cel.numFmt = FORMATO_DESVIO;
        cel.font = { ...e.font, color: undefined, size: 8, italic: c.mes === f.mesAtual };
      } else {
        const v = valores.get(`${c.mes}|${c.tipo}`);
        if (v !== null && v !== undefined) cel.value = v;
        cel.numFmt = FORMATO;
        cel.font = { ...e.font, color: undefined };
      }
      cel.fill = preencher(e.fill);
      cel.alignment = { vertical: 'middle', horizontal: 'center' };
      cel.border = {
        bottom: borda(),
        left: inicioDeMes(i) ? borda(CORES.CINZA_LINHA) : undefined,
        top: separar ? borda(CORES.CINZA_ESCURO) : undefined,
      };
    });
    linha += 1;
    return linha - 1;
  };
  const soma = (linhas, col, resultado) =>
    linhas.length ? { formula: linhas.map((l) => `${letra(col)}${l}`).join('+'), result: resultado || 0 } : null;
  const { saldoInicial, saldoFinal, resultado } = f.porColuna;

  const linhaSI = linha;
  const linhaRes = linhaSI + 1 + f.estrutura.reduce((t, n1) => t + 1 + n1.lados.reduce((tl, l) => tl + 1 + l.filhos.reduce((tf, n2) => tf + 1 + n2.contas.length, 0), 0), 0);
  const linhaSF = linhaRes + 1;
  // Saldo inicial: real (Realizado e o 1º mês projetado); projetado seguinte = final do mês anterior.
  escrever('saldo', 'Saldo inicial', (c, k) => {
    if (saldoInicial[k] === undefined) return null;
    // Projetado: o mês anterior também é projetado (encadeia) -> fórmula; o 1º mês projetado parte
    // do saldo real (valor).
    const chaveAnterior = `${f.somarMeses(c.mes, -1)}|P`;
    if (c.tipo === 'P' && colDe.has(chaveAnterior) && saldoFinal[chaveAnterior] !== undefined) {
      return { formula: `${letra(colDe.get(chaveAnterior))}${linhaSF}`, result: saldoInicial[k] };
    }
    return saldoInicial[k];
  });

  const linhasN1 = [];
  f.estrutura.forEach((n1) => {
    const linhaN1 = linha;
    linhasN1.push(linhaN1);
    linha += 1; // escrito depois (soma dos lados)
    const linhasLado = [];
    n1.lados.forEach((lado) => {
      const linhaLado = linha;
      linhasLado.push(linhaLado);
      linha += 1;
      const linhasN2 = [];
      lado.filhos.forEach((n2) => {
        const linhaN2 = linha;
        linhasN2.push(linhaN2);
        linha += 1;
        const primeira = linha;
        n2.contas.forEach((c) => escrever('conta', `${c.conta.codigo}  ${c.conta.name}`, (col, k) => c.porColuna[k] ?? null));
        const ultimaConta = linha - 1;
        const volta = linha;
        linha = linhaN2;
        escrever('n2', n2.descricao, (c, k, col) =>
          n2.contas.length ? { formula: `SUM(${letra(col)}${primeira}:${letra(col)}${ultimaConta})`, result: n2.porColuna[k] || 0 } : null
        );
        linha = volta;
      });
      const volta = linha;
      linha = linhaLado;
      escrever('lado', lado.descricao, (c, k, col) => soma(linhasN2, col, lado.porColuna[k]));
      linha = volta;
    });
    const volta = linha;
    linha = linhaN1;
    escrever('n1', n1.descricao, (c, k, col) => soma(linhasLado, col, n1.porColuna[k]));
    linha = volta;
  });

  escrever('resultado', 'Resultado do mês', (c, k, col) => soma(linhasN1, col, resultado[k]) ?? 0, { separar: true });
  // Saldo final: meses fechados do Realizado = saldo real do banco; os demais = inicial + resultado.
  escrever('saldo', 'Saldo final', (c, k, col) => {
    if (saldoFinal[k] === undefined) return null;
    if (c.tipo === 'R' && c.mes < f.mesAtual) return saldoFinal[k];
    return { formula: `${letra(col)}${linhaSI}+${letra(col)}${linhaRes}`, result: saldoFinal[k] };
  });

  impressao(sheet, `${LINHA_MESES}:${LINHA_TIPOS}`);
  return sheet;
};
