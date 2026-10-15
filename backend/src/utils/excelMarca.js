const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

// Identidade visual dos Excel gerados pelo sistema (exceljs): paleta, formatos, cabeçalho com a
// logomarca e a correção do tamanho das imagens. Mesma base de
// modules/saldo-contas-bancarias/saldosExcel.service.js, aqui reaproveitável por várias abas.

// Logomarca completa (PNG — exceljs não aceita SVG). Proporção 2.4:1.
const LOGO_PNG = fs.readFileSync(path.join(__dirname, '..', 'assets', 'logomarca.png'));

const CORES = {
  AZUL: 'FF1D4ED8',
  AZUL_ESCURO: 'FF1E3A8A',
  AZUL_CLARO: 'FFDBEAFE',
  AZUL_MUITO_CLARO: 'FFEFF4FF',
  CINZA: 'FF6B7280',
  CINZA_ESCURO: 'FF374151',
  CINZA_CLARO: 'FFF3F4F6',
  CINZA_BORDA: 'FFD1D5DB',
  CINZA_LINHA: 'FFE5E7EB',
  SLATE: 'FFF1F5F9',
  PRETO: 'FF111827',
  BRANCO: 'FFFFFFFF',
  TEAL: 'FF0F766E',
  TEAL_CLARO: 'FFE6F4F1',
  VERMELHO: 'FFE11D48',
  VERMELHO_CLARO: 'FFFFE4E6',
  AMARELO_CLARO: 'FFFEF3C7',
};

// Negativo em vermelho, como na tela.
const FORMATOS = {
  moeda: '#,##0.00;[Red]-#,##0.00',
  moedaInteira: '#,##0;[Red]-#,##0',
  pct: '0.00%',
  pct4: '0.0000%',
  int: '#,##0',
  data: 'dd/mm/yyyy',
  dataHora: 'dd/mm/yyyy hh:mm',
  mes: 'mmm/yyyy',
};

const borda = (argb = CORES.CINZA_LINHA, style = 'thin') => ({ style, color: { argb } });
const preencher = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

// Instante -> Date com a hora de Brasília nos campos UTC (o Excel não tem fuso: mostra o que estiver
// gravado; sem isso, 20:26 de Brasília sairia 23:26).
const PARTES_SP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
function dataHoraExcel(v) {
  if (v === null || v === undefined || v === '') return null;
  const p = Object.fromEntries(PARTES_SP.formatToParts(new Date(v)).map((x) => [x.type, Number(x.value)]));
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

// 'AAAA-MM-DD' / 'AAAA-MM' / Date -> Date em UTC (a célula vira data de verdade, sem fuso).
function dataExcel(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    const d = dataHoraExcel(v);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const [a, m, d] = String(v).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d || 1));
}

// Largura de coluna (caracteres) -> pixels, como o Excel (Calibri 11, MDW 7).
const pixelsDaColuna = (largura) => Math.trunc(((256 * largura + Math.trunc(128 / 7)) / 256) * 7);

/**
 * Cabeçalho padrão no topo da aba: logomarca à esquerda (linhas 1-3), título e subtítulo ao lado,
 * linha 4 com os filtros e "Gerado por ... em ...". Defina as larguras das colunas ANTES de chamar
 * (o título começa na primeira coluna depois da logomarca). Devolve a próxima linha livre (6).
 */
function cabecalho(workbook, sheet, { titulo, subtitulo, filtros = [], gerado, ultimaColuna }) {
  const LARGURA_LOGO = 130;
  const ALTURA_LOGO = 54;
  const MARGEM = 10;
  [1, 2, 3].forEach((l) => (sheet.getRow(l).height = 22));

  // Primeira coluna depois da logomarca.
  let px = 0;
  let colTitulo = 1;
  while (px < LARGURA_LOGO + MARGEM * 2 && colTitulo <= ultimaColuna) {
    px += pixelsDaColuna(sheet.getColumn(colTitulo).width || 9);
    colTitulo += 1;
  }
  colTitulo = Math.min(colTitulo, ultimaColuna);

  const imageId = workbook.__logoMarcaId ?? (workbook.__logoMarcaId = workbook.addImage({ buffer: LOGO_PNG, extension: 'png' }));
  sheet.addImage(imageId, {
    tl: { nativeCol: 0, nativeColOff: MARGEM * 9525, nativeRow: 0, nativeRowOff: Math.round((66 * 12700 - ALTURA_LOGO * 9525) / 2) },
    ext: { width: LARGURA_LOGO, height: ALTURA_LOGO },
  });

  sheet.mergeCells(1, colTitulo, 2, ultimaColuna);
  const t = sheet.getCell(1, colTitulo);
  t.value = titulo;
  t.font = { bold: true, size: 16, color: { argb: CORES.PRETO } };
  t.alignment = { vertical: 'bottom', horizontal: 'left' };
  sheet.mergeCells(3, colTitulo, 3, ultimaColuna);
  const s = sheet.getCell(3, colTitulo);
  s.value = subtitulo || '';
  s.font = { size: 10, color: { argb: CORES.CINZA } };
  s.alignment = { vertical: 'top', horizontal: 'left' };
  for (let c = 1; c <= ultimaColuna; c += 1) sheet.getCell(3, c).border = { bottom: borda(CORES.AZUL, 'medium') };

  sheet.mergeCells(4, 1, 4, ultimaColuna);
  const f = sheet.getCell(4, 1);
  f.value = {
    richText: [
      ...filtros.flatMap(([rotulo, valor], i) => [
        { text: `${i ? '     ' : ''}${rotulo}: `, font: { size: 9, color: { argb: CORES.CINZA } } },
        { text: String(valor), font: { size: 9, bold: true, color: { argb: CORES.CINZA_ESCURO } } },
      ]),
      ...(gerado ? [{ text: `     ·     ${gerado}`, font: { size: 9, italic: true, color: { argb: CORES.CINZA } } }] : []),
    ],
  };
  f.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  sheet.getRow(4).height = filtros.length > 4 ? 30 : 18;
  return 6;
}

// Faixa de seção (texto branco em azul) mesclada de `de` a `ate`.
function faixa(sheet, linha, texto, de, ate) {
  sheet.mergeCells(linha, de, linha, ate);
  const c = sheet.getCell(linha, de);
  c.value = texto;
  c.font = { bold: true, size: 11, color: { argb: CORES.BRANCO } };
  c.fill = preencher(CORES.AZUL);
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(linha).height = 20;
}

// Linha de cabeçalho de tabela (fundo azul-escuro, texto branco, quebra de linha).
function cabecalhoTabela(sheet, linha, colunas, deColuna = 1) {
  colunas.forEach((rotulo, i) => {
    const c = sheet.getCell(linha, deColuna + i);
    c.value = rotulo;
    c.font = { bold: true, size: 9, color: { argb: CORES.BRANCO } };
    c.fill = preencher(CORES.AZUL_ESCURO);
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = { left: borda(CORES.AZUL_ESCURO), right: borda(CORES.AZUL_ESCURO) };
  });
  sheet.getRow(linha).height = 30;
}

// Impressão: paisagem, ajustada à largura, títulos repetidos.
function impressao(sheet, linhasTitulo) {
  sheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    ...(linhasTitulo ? { printTitlesRow: linhasTitulo } : {}),
  };
}

// Correções no .xlsx que o exceljs 4.4.0 grava errado (reabre como zip e corrige o XML):
// 1) toda imagem sai com <a:ext cx="0" cy="0"/> no spPr — o Excel do computador ignora, mas o preview
//    do WhatsApp e os apps de celular não mostram a imagem. Copia o tamanho real do <xdr:ext> em
//    TODOS os desenhos (uma logomarca por aba = vários drawingN.xml). Mesma correção de
//    saldosExcel.service.js::corrigirTamanhoImagemNoBuffer, que só olha o drawing1;
// 2) aba com agrupamento de linhas (outlinePr) e "ajustar à página" (pageSetUpPr) sai com os dois na
//    ordem trocada dentro do <sheetPr> — o esquema exige outlinePr antes, e o Excel recusa abrir.
async function corrigirArquivo(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const arquivos = Object.keys(zip.files).filter((n) => /^xl\/(drawings\/drawing|worksheets\/sheet)\d+\.xml$/.test(n));
  let mudou = false;
  for (const caminho of arquivos) {
    const xml = await zip.file(caminho).async('string');
    const corrigido = caminho.includes('drawings')
      ? xml.replace(
          /(<xdr:ext cx="(\d+)" cy="(\d+)"\/>[\s\S]*?)<a:ext cx="0" cy="0"\/>/g,
          (match, antes, cx, cy) => `${antes}<a:ext cx="${cx}" cy="${cy}"/>`
        )
      : xml.replace(/(<sheetPr[^>]*>)(<pageSetUpPr[^>]*\/>)(<outlinePr[^>]*\/>)/, '$1$3$2');
    if (corrigido !== xml) {
      zip.file(caminho, corrigido);
      mudou = true;
    }
  }
  return mudou ? zip.generateAsync({ type: 'nodebuffer' }) : buffer;
}

module.exports = { CORES, FORMATOS, borda, preencher, dataExcel, dataHoraExcel, cabecalho, faixa, cabecalhoTabela, impressao, corrigirArquivo };
