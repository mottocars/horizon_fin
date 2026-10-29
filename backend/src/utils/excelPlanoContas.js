const { CORES, borda, preencher, cabecalho, impressao } = require('./excelMarca');

// Exportar Excel das abas Plano Contas (DRE Gerencial e DFC Construtoras): espelho da tabela da tela
// — a árvore inteira do plano, aberta. Código e Conta primeiro, Status por último e, no meio, as
// colunas de cada aba (`colunas`). Totalizadoras em cinza e negrito, recuo por nível, drilldown pelo
// contorno do Excel (botões à esquerda); coluna `campo` (as comboboxes da tela) vazia em âmbar e
// preenchida em azul claro. Autofiltro no cabeçalho.

const VERDE = 'FF059669';
const AMBAR = 'FFFCD34D';
const LINHA_CABECALHO = 6;

// Mesma lógica de PlanoDeContasTab.jsx / DfcPlanoContasTab.jsx::formatarCodigoMascara (máscara do
// plano financeiro).
function codigoFormatado(conta) {
  const larguras = [1, 2, 3, 4, 5, 6, 7].map((n) => conta[`mascara_nivel_${n}`]);
  const digitos = String(conta.sienge_id);
  const segmentos = [];
  let pos = 0;
  for (const largura of larguras) {
    if (pos >= digitos.length) break;
    if (!largura) {
      segmentos[segmentos.length - 1] += digitos.slice(pos);
      pos = digitos.length;
      break;
    }
    segmentos.push(digitos.slice(pos, pos + largura));
    pos += largura;
  }
  if (pos < digitos.length && segmentos.length > 0) segmentos[segmentos.length - 1] += digitos.slice(pos);
  return segmentos.length > 0 ? segmentos.join('.') : digitos;
}

// Linhas na ordem da tela, com o nível de cada uma — mesma árvore de montarArvore das telas (a mãe é
// a totalizadora mais próxima cujo código é prefixo do dela): em ordem de código, a pilha de
// totalizadoras abertas dá a profundidade.
function linhasDaArvore(contas) {
  const ordenadas = [...contas].sort((a, b) => String(a.sienge_id).localeCompare(String(b.sienge_id)));
  const pilha = [];
  return ordenadas.map((conta) => {
    const codigo = String(conta.sienge_id);
    while (pilha.length && !codigo.startsWith(String(pilha[pilha.length - 1]))) pilha.pop();
    const nivel = pilha.length;
    if (conta.tp_conta === 'T') pilha.push(conta.sienge_id);
    return { conta, nivel };
  });
}

// `contas`: planos_financeiros_sienge da empresa (sienge_id, name, tp_conta, fl_ativa,
// mascara_nivel_1..7). `colunas`: [{ titulo, largura, valor(conta) -> texto ('' = vazio), campo
// (vazio âmbar / preenchido azul), centro (alinhado ao centro), cor (argb da fonte quando tem
// valor) }] — só nas analíticas; nas totalizadoras ficam em branco, como na tela.
function planilhaPlanoContas(workbook, { nomeAba, titulo, subtitulo, filtros, gerado, contas, colunas }) {
  const todas = [
    { titulo: 'Código', largura: 16 },
    { titulo: 'Conta', largura: 64 },
    ...colunas,
    { titulo: 'Status', largura: 11 },
  ];
  const sheet = workbook.addWorksheet(nomeAba, {
    views: [{ state: 'frozen', ySplit: LINHA_CABECALHO, showGridLines: false }],
    properties: { outlineProperties: { summaryBelow: false, summaryRight: false } },
  });
  todas.forEach((c, i) => (sheet.getColumn(i + 1).width = c.largura));
  cabecalho(workbook, sheet, { titulo, subtitulo, filtros, gerado, ultimaColuna: todas.length });

  // Cabeçalho da tabela como o da tela: azul claro, texto azul, linha azul embaixo.
  todas.forEach((c, i) => {
    const cel = sheet.getCell(LINHA_CABECALHO, i + 1);
    cel.value = c.titulo.toUpperCase();
    cel.font = { bold: true, size: 9, color: { argb: CORES.AZUL } };
    cel.fill = preencher(CORES.AZUL_MUITO_CLARO);
    cel.alignment = { vertical: 'middle', horizontal: c.centro ? 'center' : 'left', indent: c.centro ? 0 : 1 };
    cel.border = { bottom: borda(CORES.AZUL, 'medium') };
  });
  sheet.getRow(LINHA_CABECALHO).height = 22;

  let maiorNivel = 0;
  linhasDaArvore(contas).forEach(({ conta, nivel }, i) => {
    const totalizadora = conta.tp_conta === 'T';
    const valores = colunas.map((c) => (totalizadora ? '' : c.valor(conta) ?? ''));
    const row = sheet.getRow(LINHA_CABECALHO + 1 + i);
    // Código só com dígitos (plano sem máscara de níveis) vai como número: como texto o Excel marca
    // "número armazenado como texto" em toda linha.
    const codigo = codigoFormatado(conta);
    row.values = [/^\d+$/.test(codigo) ? Number(codigo) : codigo, conta.name, ...valores, conta.fl_ativa === 'S' ? 'Ativa' : 'Inativa'];
    row.height = totalizadora ? 18 : 16;
    if (nivel) row.outlineLevel = Math.min(nivel, 7);
    maiorNivel = Math.max(maiorNivel, nivel);

    for (let col = 1; col <= todas.length; col += 1) {
      const cel = row.getCell(col);
      cel.fill = preencher(totalizadora ? CORES.CINZA_CLARO : CORES.BRANCO);
      cel.border = { bottom: borda(totalizadora ? CORES.CINZA_BORDA : CORES.CINZA_LINHA) };
      cel.alignment = { vertical: 'middle', horizontal: todas[col - 1].centro ? 'center' : 'left', indent: todas[col - 1].centro ? 0 : 1 };
    }
    row.getCell(1).font = { size: 9, color: { argb: CORES.CINZA } };
    row.getCell(2).font = { size: 9, bold: totalizadora, color: { argb: totalizadora ? CORES.PRETO : CORES.CINZA_ESCURO } };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 + nivel * 2 };
    if (!totalizadora) {
      colunas.forEach((c, j) => {
        const cel = row.getCell(3 + j);
        cel.font = { size: 9, color: { argb: (valores[j] && c.cor) || CORES.CINZA_ESCURO } };
        if (c.campo) {
          cel.fill = preencher(valores[j] ? CORES.AZUL_MUITO_CLARO : CORES.AMARELO_CLARO);
          cel.border = { bottom: borda(valores[j] ? CORES.CINZA_LINHA : AMBAR) };
        }
      });
    }
    row.getCell(todas.length).font = { size: 9, color: { argb: conta.fl_ativa === 'S' ? VERDE : CORES.CINZA } };
  });

  sheet.properties.outlineLevelRow = Math.min(maiorNivel, 7);
  sheet.autoFilter = { from: { row: LINHA_CABECALHO, column: 1 }, to: { row: LINHA_CABECALHO, column: todas.length } };
  impressao(sheet, `${LINHA_CABECALHO}:${LINHA_CABECALHO}`);
  return sheet;
}

module.exports = { planilhaPlanoContas };
