const { CORES, FORMATOS, borda, preencher, dataExcel, dataHoraExcel, cabecalho, cabecalhoTabela, impressao } = require('../../../utils/excelMarca');

// Aba "Saldos das Contas": saldo de abertura de cada conta com "Projeta DFC" em cada mês do período
// até o mês atual (soma do extrato antes do dia 1º) — o TOTAL é o Saldo inicial realizado do fluxo. No tipo de saldo
// HORIZON, o totalizador do Saldo Contas Bancárias por conta (planilhaSaldosHorizon).

const MESES_CAB = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const rotuloMes = (m) => `${MESES_CAB[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;

// Tipo de saldo HORIZON (DFC Construtoras › Contas › engrenagem): o totalizador da tela Saldo Contas Bancárias no 1º
// dia do mês atual com saldo lançado, por conta (classificação › conta), com Liberado, Cheque especial e Bloqueado e
// o quanto entra no saldo (as partes marcadas). O TOTAL de "Entra no saldo" é o Saldo Inicial do mês atual no fluxo.
function planilhaSaldosHorizon(workbook, h, meta) {
  const dataBR = h.data ? h.data.split('-').reverse().join('/') : null;
  const partes = [
    ['liberado', 'Liberado', h.config.soma_liberado],
    ['limite_cheque', 'Cheque especial', h.config.soma_cheque],
    ['bloqueado', 'Bloqueado', h.config.soma_bloqueado],
  ];
  const fixas = [
    ['Classificação', 20],
    ['Empresa', 42],
    ['Conta', 14],
    ['Nome', 26],
    ['Tipo', 14],
  ];
  const colunasValor = [...partes.map(([, r, marcada]) => [marcada ? r : `${r} (não soma)`, 17]), ['Entra no saldo', 18]];
  const ultima = fixas.length + colunasValor.length;
  const LINHA_CAB = 6;
  const sheet = workbook.addWorksheet('Saldos das Contas', {
    views: [{ state: 'frozen', xSplit: 4, ySplit: LINHA_CAB, showGridLines: false }],
  });
  [...fixas, ...colunasValor].forEach(([, w], i) => (sheet.getColumn(i + 1).width = w));
  const marcadas = partes.filter(([, , m]) => m).map(([, r]) => r);
  cabecalho(workbook, sheet, {
    titulo: 'Saldos das Contas',
    subtitulo: `Saldo das Contas Horizon: totalizador da tela Saldo Contas Bancárias ${
      dataBR ? `em ${dataBR} (1º dia do mês atual com saldo lançado)` : '— nenhum saldo lançado no mês atual'
    }. Entra no saldo = ${marcadas.join(' + ') || 'nenhuma parte'}; o TOTAL é o Saldo Inicial do mês atual no fluxo. Não depende do filtro de centro de custo.`,
    filtros: meta.filtros,
    gerado: meta.gerado,
    ultimaColuna: ultima,
  });
  cabecalhoTabela(sheet, LINHA_CAB, [...fixas.map(([r]) => r), ...colunasValor.map(([r]) => r)]);

  const contas = [...h.contas].sort(
    (a, b) =>
      (a.classificacao ? 0 : 1) - (b.classificacao ? 0 : 1) ||
      String(a.classificacao || '').localeCompare(String(b.classificacao || ''), 'pt-BR') ||
      b.saldo - a.saldo
  );
  let linha = LINHA_CAB + 1;
  contas.forEach((c, i) => {
    const row = sheet.getRow(linha);
    const valores = [
      c.classificacao || 'Sem classificação',
      c.company_name || '',
      c.numero_conta,
      c.nome || '',
      c.tipo_descricao || '',
      ...partes.map(([k]) => c[k] || 0),
      c.saldo || 0,
    ];
    valores.forEach((v, j) => {
      const cel = row.getCell(j + 1);
      const col = j + 1;
      const parte = partes[col - fixas.length - 1];
      cel.value = v;
      cel.font = { size: 9, color: { argb: parte && !parte[2] ? CORES.CINZA : CORES.CINZA_ESCURO }, bold: col === ultima };
      cel.border = { bottom: borda() };
      if (i % 2) cel.fill = preencher(CORES.CINZA_CLARO);
      if (col > fixas.length) cel.numFmt = FORMATOS.moeda;
      cel.alignment = { vertical: 'middle', horizontal: col > fixas.length ? 'right' : 'left' };
    });
    linha += 1;
  });

  const total = sheet.getRow(linha);
  total.getCell(1).value = 'TOTAL';
  for (let col = 1; col <= ultima; col += 1) {
    const cel = total.getCell(col);
    cel.font = { bold: true, size: 10, color: { argb: CORES.PRETO } };
    cel.fill = preencher(CORES.AZUL_CLARO);
    cel.border = { top: borda(CORES.AZUL, 'medium') };
  }
  const chaves = [...partes.map(([k]) => k), 'saldo'];
  chaves.forEach((k, i) => {
    const col = fixas.length + i + 1;
    const letra = sheet.getColumn(col).letter;
    const cel = total.getCell(col);
    cel.value = {
      formula: contas.length ? `SUM(${letra}${LINHA_CAB + 1}:${letra}${linha - 1})` : '0',
      result: Math.round(contas.reduce((t, c) => t + (c[k] || 0), 0) * 100) / 100,
    };
    cel.numFmt = FORMATOS.moeda;
    cel.alignment = { horizontal: 'right' };
  });
  sheet.autoFilter = { from: { row: LINHA_CAB, column: 1 }, to: { row: LINHA_CAB, column: ultima } };
  impressao(sheet, `${LINHA_CAB}:${LINHA_CAB}`);
  return sheet;
}

module.exports = function planilhaSaldos(workbook, d, meta) {
  if (d.saldoHorizon) return planilhaSaldosHorizon(workbook, d.saldoHorizon, meta);
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
