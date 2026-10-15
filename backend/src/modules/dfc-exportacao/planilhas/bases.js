const { CORES, FORMATOS, borda, preencher, dataExcel, dataHoraExcel, cabecalho, cabecalhoTabela, impressao } = require('../../../utils/excelMarca');

// Abas "Base Realizado" e "Base Projetado": base empilhada, uma linha por lançamento/parcela/item,
// com a classificação completa (centro, máscaras, entrada/saída, natureza) — pronta pra filtro e
// tabela dinâmica. Acima do cabeçalho, o TOTAL DO FILTRO (SUBTOTAL: soma só as linhas visíveis).

const LINHA_TOTAL = 6;
const LINHA_CAB = 7;

const FORMATO_DE = {
  mes: FORMATOS.mes,
  data: FORMATOS.data,
  dataHora: FORMATOS.dataHora,
  moeda: FORMATOS.moeda,
  pct: FORMATOS.pct,
  int: FORMATOS.int,
  numero: '#,##0.0',
};
const DATAS = new Set(['mes', 'data', 'dataHora']);

// colunas: [{ chave, rotulo, largura, formato?, total? }]; `estiloLinha(l)` -> fill opcional.
function base(workbook, { nome, titulo, subtitulo, colunas, linhas, estiloLinha, link }, meta) {
  const ultima = colunas.length;
  const sheet = workbook.addWorksheet(nome, { views: [{ state: 'frozen', xSplit: 0, ySplit: LINHA_CAB, showGridLines: false }] });
  colunas.forEach((c, i) => (sheet.getColumn(i + 1).width = c.largura));
  cabecalho(workbook, sheet, { titulo, subtitulo, filtros: meta.filtros, gerado: meta.gerado, ultimaColuna: ultima });
  cabecalhoTabela(sheet, LINHA_CAB, colunas.map((c) => c.rotulo));

  const primeira = LINHA_CAB + 1;
  const ultimaLinha = Math.max(primeira, LINHA_CAB + linhas.length);
  linhas.forEach((l, i) => {
    const row = sheet.getRow(primeira + i);
    const fill = estiloLinha?.(l);
    colunas.forEach((c, j) => {
      const cel = row.getCell(j + 1);
      let v = l[c.chave];
      if (v === undefined || v === '') v = null;
      if (v !== null && DATAS.has(c.formato)) v = c.formato === 'dataHora' ? dataHoraExcel(v) : dataExcel(v);
      // Código só de dígitos vira número (sem o aviso de "número armazenado como texto").
      if (c.numerico && typeof v === 'string' && /^\d+$/.test(v)) v = Number(v);
      if (c.link && v !== null) {
        const destino = link?.(l);
        cel.value = destino ? { text: String(v), hyperlink: destino } : v;
        if (destino) cel.font = { size: 9, underline: true, color: { argb: CORES.AZUL } };
      } else {
        cel.value = v;
      }
      if (!cel.font) cel.font = { size: 9, color: { argb: c.chave === 'valor' ? CORES.PRETO : CORES.CINZA_ESCURO }, bold: c.chave === 'valor' };
      if (c.formato) cel.numFmt = FORMATO_DE[c.formato];
      cel.border = { bottom: borda() };
      if (fill) cel.fill = preencher(fill);
    });
  });

  // Total do filtro, por cima do cabeçalho.
  const rTotal = sheet.getRow(LINHA_TOTAL);
  rTotal.height = 20;
  sheet.mergeCells(LINHA_TOTAL, 1, LINHA_TOTAL, 2);
  const rot = rTotal.getCell(1);
  rot.value = 'TOTAL DO FILTRO';
  rot.font = { bold: true, size: 9, color: { argb: CORES.AZUL_ESCURO } };
  rot.alignment = { vertical: 'middle', indent: 1 };
  rTotal.getCell(3).value = {
    formula: `SUBTOTAL(103,A${primeira}:A${ultimaLinha})`,
    result: linhas.length,
  };
  rTotal.getCell(3).numFmt = '#,##0" linhas visíveis"';
  rTotal.getCell(3).font = { size: 9, color: { argb: CORES.CINZA } };
  colunas.forEach((c, j) => {
    if (!c.total) return;
    const letra = sheet.getColumn(j + 1).letter;
    const cel = rTotal.getCell(j + 1);
    cel.value = {
      formula: `SUBTOTAL(109,${letra}${primeira}:${letra}${ultimaLinha})`,
      result: Math.round(linhas.reduce((t, l) => t + (Number(l[c.chave]) || 0), 0) * 100) / 100,
    };
    cel.numFmt = FORMATO_DE[c.formato];
    cel.font = { bold: true, size: 10, color: { argb: CORES.PRETO } };
  });
  for (let col = 1; col <= ultima; col += 1) {
    const cel = rTotal.getCell(col);
    cel.fill = preencher(CORES.AZUL_CLARO);
    cel.border = { top: borda(CORES.AZUL), bottom: borda(CORES.AZUL) };
  }

  sheet.autoFilter = { from: { row: LINHA_CAB, column: 1 }, to: { row: ultimaLinha, column: ultima } };
  impressao(sheet, `${LINHA_CAB}:${LINHA_CAB}`);
  return sheet;
}

const CLASSIFICACAO = [
  { chave: 'centro', rotulo: 'Centro de custo', largura: 22 },
  { chave: 'mascara_n1', rotulo: 'Máscara N1', largura: 26 },
  { chave: 'lado', rotulo: 'Entrada / Saída', largura: 10 },
  { chave: 'mascara_n2', rotulo: 'Máscara N2', largura: 30 },
  { chave: 'natureza_codigo', rotulo: 'Cód. natureza', largura: 13, numerico: true },
  { chave: 'natureza', rotulo: 'Natureza', largura: 34 },
];

function realizado(workbook, d, meta) {
  return base(
    workbook,
    {
      nome: 'Base Realizado',
      titulo: 'Base do Realizado',
      subtitulo:
        'Uma linha por lançamento do extrato bancário × rateio (centro de custo e natureza). "No DFC" = lançamento × rateio — a soma por mês é o Realizado do fluxo.',
      colunas: [
        { chave: 'mes', rotulo: 'Mês', largura: 10, formato: 'mes' },
        { chave: 'data', rotulo: 'Data', largura: 11, formato: 'data' },
        ...CLASSIFICACAO,
        { chave: 'empresa', rotulo: 'Empresa', largura: 30 },
        { chave: 'conta_bancaria', rotulo: 'Conta bancária', largura: 24 },
        { chave: 'origem', rotulo: 'Origem', largura: 14 },
        { chave: 'titulo', rotulo: 'Título / Parc.', largura: 12 },
        { chave: 'documento', rotulo: 'Documento', largura: 18 },
        { chave: 'favorecido', rotulo: 'Favorecido / Descrição', largura: 36 },
        { chave: 'valor_lancamento', rotulo: 'Valor do lançamento', largura: 15, formato: 'moeda', total: false },
        { chave: 'percentual', rotulo: '% rateio', largura: 9, formato: 'pct' },
        { chave: 'valor', rotulo: 'No DFC', largura: 15, formato: 'moeda', total: true },
        { chave: 'id_sienge', rotulo: 'Id Sienge', largura: 10 },
      ],
      linhas: d.realizado,
    },
    meta
  );
}

function projetado(workbook, d, meta, abasCef) {
  return base(
    workbook,
    {
      nome: 'Base Projetado',
      titulo: 'Base do Projetado',
      subtitulo: `O que compõe cada valor da versão ${d.fluxo.versao?.numero ?? '—'} do Orçamento, fonte a fonte. Linhas amarelas = ajuste: a fonte mudou depois da versão salva (a base soma exatamente o Projetado do fluxo).`,
      colunas: [
        { chave: 'mes', rotulo: 'Mês', largura: 10, formato: 'mes' },
        ...CLASSIFICACAO,
        { chave: 'origem', rotulo: 'Origem projeção', largura: 22 },
        { chave: 'fonte', rotulo: 'Fonte', largura: 24, link: true },
        { chave: 'referencia', rotulo: 'Título / Referência', largura: 18 },
        { chave: 'documento', rotulo: 'Documento', largura: 16 },
        { chave: 'descricao', rotulo: 'Credor / Cliente / Descrição', largura: 36 },
        { chave: 'emissao', rotulo: 'Emissão / Digitado em', largura: 12, formato: 'data' },
        { chave: 'vencimento', rotulo: 'Vencimento', largura: 11, formato: 'data' },
        { chave: 'mes_orcado', rotulo: 'Mês orçado', largura: 10, formato: 'mes' },
        { chave: 'prazo', rotulo: 'Prazo médio (dias)', largura: 9, formato: 'numero' },
        { chave: 'valor_base', rotulo: 'Valor base', largura: 15, formato: 'moeda' },
        { chave: 'percentual', rotulo: '% rateio', largura: 9, formato: 'pct' },
        { chave: 'saldo_aberto', rotulo: 'Saldo em aberto', largura: 14, formato: 'moeda' },
        { chave: 'valor', rotulo: 'No DFC', largura: 15, formato: 'moeda', total: true },
        { chave: 'observacao', rotulo: 'Observação', largura: 40 },
      ],
      linhas: d.projetado,
      estiloLinha: (l) => (l.ajuste ? CORES.AMARELO_CLARO : null),
      link: (l) => (l.dossie && abasCef.has(l.dossie) ? `#'${abasCef.get(l.dossie)}'!A1` : null),
    },
    meta
  );
}

module.exports = { realizado, projetado };
