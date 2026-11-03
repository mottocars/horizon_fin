const { CORES, borda, preencher, dataExcel, dataHoraExcel, cabecalho, cabecalhoTabela, impressao } = require('../../../utils/excelMarca');

// Peças comuns das abas da exportação de auditoria da DRE: formatos, letra de coluna, referência de
// outra aba nas fórmulas e a tabela de base (cabeçalho com a logomarca, TOTAL DO FILTRO por SUBTOTAL —
// soma só as linhas visíveis — e uma linha por registro, com autofiltro), no padrão das bases da
// exportação do DFC (dfc-exportacao/planilhas/bases.js).

const FMT = {
  moeda: '#,##0.00;[Red]-#,##0.00',
  // Diferença com o sistema: zero em verde.
  diferenca: '[Red]#,##0.00;[Red]-#,##0.00;[Color10]0.00',
  poc: '0.000000%',
  fracao: '0.00000000',
  pct: '0.00%',
  pctRateio: '0.00"%"', // o % do rateio vem de 0 a 100
  int: '#,##0',
  data: 'dd/mm/yyyy',
  mes: 'mmm/yyyy',
  dataHora: 'dd/mm/yyyy hh:mm',
};

const LINHA_TOTAL = 6;
const LINHA_CAB = 7;
const PRIMEIRA = 8;

function letra(n) {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}
const aba = (nome) => `'${nome.replace(/'/g, "''")}'`;
// Código só de dígitos vira número (sem o aviso de "número armazenado como texto"; o filtro e o
// SOMASES acham igual nas abas).
const codigo = (v) => (typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : v ?? null);
const fonte = (extra = {}) => ({ size: 9, color: { argb: CORES.CINZA_ESCURO }, ...extra });

// Posição das colunas e das linhas de uma tabela de base, antes de escrever — as outras abas montam as
// fórmulas com `faixa(chave)` ('Aba'!$X$8:$X$N, absoluto).
function layout(nome, colunas, quantidade) {
  const col = Object.fromEntries(colunas.map((c, i) => [c.chave, letra(i + 1)]));
  const ultima = Math.max(PRIMEIRA, PRIMEIRA + quantidade - 1);
  return {
    nome,
    colunas,
    col,
    primeira: PRIMEIRA,
    ultima,
    faixa: (chave) => `${aba(nome)}!$${col[chave]}$${PRIMEIRA}:$${col[chave]}$${ultima}`,
  };
}

// Escreve a tabela. colunas: [{ chave, rotulo, largura, formato?, total?, formula?(linha, l) }];
// `formula` devolve { formula, result } pra coluna calculada. `estiloLinha(l)` -> cor de fundo opcional.
function tabela(workbook, sheet, lay, { titulo, subtitulo, linhas, meta, estiloLinha }) {
  const { colunas } = lay;
  const ultimaCol = colunas.length;
  colunas.forEach((c, i) => (sheet.getColumn(i + 1).width = c.largura));
  cabecalho(workbook, sheet, { titulo, subtitulo, filtros: meta.filtros, gerado: meta.gerado, ultimaColuna: ultimaCol });
  cabecalhoTabela(sheet, LINHA_CAB, colunas.map((c) => c.rotulo));
  sheet.getRow(LINHA_CAB).height = 42; // rótulos longos em até 3 linhas

  const fNormal = fonte();
  const fValor = fonte({ color: { argb: CORES.PRETO }, bold: true });
  const linhaBorda = { bottom: borda() };
  linhas.forEach((l, i) => {
    const n = PRIMEIRA + i;
    const row = sheet.getRow(n);
    const fill = estiloLinha?.(l);
    const fundo = fill ? preencher(fill) : null;
    colunas.forEach((c, j) => {
      const cel = row.getCell(j + 1);
      if (c.formula) cel.value = c.formula(n, l);
      else {
        let v = l[c.chave];
        if (v === undefined || v === '') v = null;
        if (v !== null && (c.formato === 'data' || c.formato === 'mes')) v = dataExcel(v);
        else if (v !== null && c.formato === 'dataHora') v = dataHoraExcel(v);
        else if (c.codigo) v = codigo(v);
        cel.value = v;
      }
      cel.font = c.destaque ? fValor : fNormal;
      if (c.formato) cel.numFmt = FMT[c.formato];
      cel.border = linhaBorda;
      if (fundo) cel.fill = fundo;
    });
  });

  // Total do filtro, por cima do cabeçalho.
  const rTotal = sheet.getRow(LINHA_TOTAL);
  rTotal.height = 20;
  // Rótulo e contagem de linhas visíveis num texto só (transborda pras colunas vazias ao lado, mesmo
  // com a primeira coluna estreita).
  const rot = rTotal.getCell(1);
  rot.value = {
    formula: `"TOTAL DO FILTRO  ·  "&SUBTOTAL(103,A${PRIMEIRA}:A${lay.ultima})&" linhas visíveis"`,
    result: `TOTAL DO FILTRO  ·  ${linhas.length} linhas visíveis`,
  };
  rot.font = { bold: true, size: 9, color: { argb: CORES.AZUL_ESCURO } };
  rot.alignment = { vertical: 'middle', indent: 1 };
  colunas.forEach((c, j) => {
    if (!c.total) return;
    const l = letra(j + 1);
    const cel = rTotal.getCell(j + 1);
    cel.value = {
      formula: `SUBTOTAL(109,${l}${PRIMEIRA}:${l}${lay.ultima})`,
      result: linhas.reduce((t, x) => t + (Number(c.total === true ? x[c.chave] : c.total(x)) || 0), 0),
    };
    cel.numFmt = FMT[c.formato] || FMT.moeda;
    cel.font = { bold: true, size: 10, color: { argb: CORES.PRETO } };
  });
  for (let c = 1; c <= ultimaCol; c += 1) {
    const cel = rTotal.getCell(c);
    cel.fill = preencher(CORES.AZUL_CLARO);
    cel.border = { top: borda(CORES.AZUL), bottom: borda(CORES.AZUL) };
  }

  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: LINHA_CAB, showGridLines: false }];
  sheet.autoFilter = { from: { row: LINHA_CAB, column: 1 }, to: { row: lay.ultima, column: ultimaCol } };
  impressao(sheet, `${LINHA_CAB}:${LINHA_CAB}`);
  return sheet;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (iso) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
const dataBr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
const dataHoraBr = (v) =>
  v ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(v)) : '—';
const moedaBr = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Rótulo de um centro (o mesmo da Memória de Cálculo e da lista da DRE Mensal).
const rotuloCentro = (c) => `${c.id} · ${c.rotulo || c.nome}`;

module.exports = { FMT, LINHA_TOTAL, LINHA_CAB, PRIMEIRA, letra, aba, codigo, fonte, layout, tabela, rotuloMes, dataBr, dataHoraBr, moedaBr, rotuloCentro };
