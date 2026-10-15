const { CORES, FORMATOS, borda, preencher, dataExcel, dataHoraExcel, cabecalho, cabecalhoTabela, impressao } = require('../../../utils/excelMarca');

// Aba "Saldos das Contas": saldo de abertura de cada conta com "Projeta DFC" em cada mês do período
// até o mês atual (soma do extrato antes do dia 1º) — o TOTAL é o Saldo inicial realizado do fluxo.

const MESES_CAB = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const rotuloMes = (m) => `${MESES_CAB[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;

module.exports = function planilhaSaldos(workbook, d, meta) {
  const meses = d.mesesSaldos;
  const fixas = [
    ['Empresa', 42],
    ['Conta', 14],
    ['Nome', 24],
    ['Banco', 24],
    ['Tipo', 14],
  ];
  const finais = [
    ['Último lançamento', 13],
    ['Extrato buscado até', 13],
    ['Sincronizado em', 16],
  ];
  const ultima = fixas.length + meses.length + finais.length;
  const LINHA_CAB = 6;
  const sheet = workbook.addWorksheet('Saldos das Contas', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: LINHA_CAB, showGridLines: false }],
  });
  [...fixas, ...meses.map(() => ['', 16]), ...finais].forEach(([, w], i) => (sheet.getColumn(i + 1).width = w));
  cabecalho(workbook, sheet, {
    titulo: 'Saldos das Contas',
    subtitulo:
      'Saldo na abertura de cada mês (soma do extrato do Sienge antes do dia 1º), só contas com Projeta DFC. Não depende do filtro de centro de custo.',
    filtros: meta.filtros,
    gerado: meta.gerado,
    ultimaColuna: ultima,
  });
  cabecalhoTabela(sheet, LINHA_CAB, [...fixas.map(([r]) => r), ...meses.map((m) => `Abertura ${rotuloMes(m)}`), ...finais.map(([r]) => r)]);

  let linha = LINHA_CAB + 1;
  d.saldos.forEach((c, i) => {
    const row = sheet.getRow(linha);
    const valores = [
      c.company_name || '',
      c.numero_conta,
      c.nome || '',
      c.banco_nome || '',
      c.tipo_descricao || '',
      ...meses.map((m) => c.saldos[m] ?? 0),
      dataExcel(c.ultimo_lancamento),
      dataExcel(c.data_ate),
      dataHoraExcel(c.sincronizado_em),
    ];
    valores.forEach((v, j) => {
      const cel = row.getCell(j + 1);
      cel.value = v;
      cel.font = { size: 9, color: { argb: CORES.CINZA_ESCURO } };
      cel.border = { bottom: borda() };
      if (i % 2) cel.fill = preencher(CORES.CINZA_CLARO);
      const col = j + 1;
      if (col > fixas.length && col <= fixas.length + meses.length) cel.numFmt = FORMATOS.moeda;
      else if (col === ultima) cel.numFmt = FORMATOS.dataHora;
      else if (col > fixas.length + meses.length) cel.numFmt = FORMATOS.data;
      cel.alignment = { vertical: 'middle', horizontal: col > fixas.length ? 'right' : 'left' };
    });
    linha += 1;
  });

  // TOTAL (fórmula) = Saldo inicial do Realizado no fluxo.
  const total = sheet.getRow(linha);
  total.getCell(1).value = 'TOTAL';
  for (let col = 1; col <= ultima; col += 1) {
    const cel = total.getCell(col);
    cel.font = { bold: true, size: 10, color: { argb: CORES.PRETO } };
    cel.fill = preencher(CORES.AZUL_CLARO);
    cel.border = { top: borda(CORES.AZUL, 'medium') };
  }
  meses.forEach((m, i) => {
    const col = fixas.length + i + 1;
    const letra = sheet.getColumn(col).letter;
    const cel = total.getCell(col);
    cel.value = {
      formula: d.saldos.length ? `SUM(${letra}${LINHA_CAB + 1}:${letra}${linha - 1})` : '0',
      result: Math.round(d.saldos.reduce((t, c) => t + (c.saldos[m] ?? 0), 0) * 100) / 100,
    };
    cel.numFmt = FORMATOS.moeda;
    cel.alignment = { horizontal: 'right' };
  });
  sheet.autoFilter = { from: { row: LINHA_CAB, column: 1 }, to: { row: LINHA_CAB, column: ultima } };
  impressao(sheet, `${LINHA_CAB}:${LINHA_CAB}`);
  return sheet;
};
