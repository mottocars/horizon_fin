const ExcelJS = require('exceljs');
const pool = require('../../config/db');
const { CORES, FORMATOS, borda, preencher, dataExcel, cabecalho, impressao, corrigirArquivo } = require('../../utils/excelMarca');
const service = require('./financeiro.service');

// Exportar Excel da aba Financeiro da DRE Gerencial (pedido do usuário, 25/11/2026): todos os exercícios (os
// cards) de uma vez, "igual como se eu exportasse um a um" — uma aba por exercício, do mais novo pro mais
// antigo, com os lançamentos da listagem do exercício sem filtro (mesmas linhas, mesma ordem, mesmo corte do
// realizado da versão da DRE). As colunas da tabela da tela e, ao lado, o que a tela mostra ao passar o mouse
// (vencimentos, nome e nº do documento, parcelas, código da natureza, % do rateio). Gerado num worker
// (dre-exportacao/exportacao.isolada.js): a GENESIS passa de 100 mil linhas.

const LINHA_CABECALHO = 6;
const ORIGEM = { P: 'A pagar', R: 'A receber', E: 'Movimento', M: 'Movimento' };
const STATUS = { ORIGINAL: 'Original', AJUSTADO: 'Ajustado', CRIADO: 'Criado' };
const COR_STATUS = { AJUSTADO: 'FF6D28D9', CRIADO: 'FF0369A1' };
const dataHora = (v) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(v));
const dataBr = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

const COLUNAS = [
  { titulo: 'Origem', largura: 11, valor: (l) => ORIGEM[l.origem] || l.origem },
  { titulo: 'Data (emissão / movimento)', largura: 12, formato: FORMATOS.data, valor: (l) => dataExcel(l.data) },
  { titulo: 'Documento', largura: 10, valor: (l) => l.documento || '' },
  { titulo: 'Nome do documento', largura: 24, valor: (l) => l.documento_nome || '' },
  { titulo: 'Nº documento', largura: 16, valor: (l) => l.numero || '' },
  { titulo: 'Título / Id Sienge', largura: 12, valor: (l) => (l.titulo === null || l.titulo === undefined ? '' : Number(l.titulo)) },
  { titulo: 'Parcelas', largura: 8, formato: FORMATOS.int, valor: (l) => (l.parcelas ? Number(l.parcelas) : '') },
  { titulo: 'Vencimento (1ª parcela)', largura: 12, formato: FORMATOS.data, valor: (l) => dataExcel(l.vencimento) },
  { titulo: 'Vencimento (última parcela)', largura: 12, formato: FORMATOS.data, valor: (l) => dataExcel(l.vencimento_ate) },
  { titulo: 'Cliente / Fornecedor / Histórico', largura: 40, valor: (l) => l.contraparte || (l.origem === 'E' ? l.documento_nome || '' : '') },
  { titulo: 'Cód. natureza', largura: 12, valor: (l) => l.natureza_id || '' },
  { titulo: 'Natureza', largura: 34, valor: (l) => (l.natureza_id ? l.natureza_nome || l.natureza_id : 'Sem natureza') },
  { titulo: 'Máscara DRE', largura: 30, valor: (l) => l.mascara_nome || '' },
  { titulo: 'Centro (id)', largura: 9, valor: (l) => (l.centro_id === null ? '' : l.centro_id) },
  { titulo: 'Centro de custo', largura: 34, valor: (l) => (l.centro_id === null ? 'Sem centro' : l.centro_nome || '') },
  { titulo: '% rateio', largura: 9, formato: '0.00', valor: (l) => (l.percentual === null ? '' : l.percentual) },
  { titulo: 'Valor', largura: 16, formato: FORMATOS.moeda, valor: (l) => l.valor },
  { titulo: 'Status', largura: 10, valor: (l) => STATUS[l.status] || l.status },
];
const COL_VALOR = COLUNAS.findIndex((c) => c.titulo === 'Valor') + 1;
const COL_STATUS = COLUNAS.findIndex((c) => c.titulo === 'Status') + 1;

async function gerar(empresaId, usuarioId) {
  const [dados, { rows: empresas }, { rows: usuarios }] = await Promise.all([
    service.lancamentosTodosExercicios(empresaId),
    pool.query('SELECT nome_fantasia, razao_social FROM empresas WHERE id = $1', [empresaId]),
    pool.query('SELECT nome FROM usuarios WHERE id = $1', [usuarioId]),
  ]);
  const empresa = empresas[0]?.nome_fantasia?.trim() || empresas[0]?.razao_social || `Empresa ${empresaId}`;
  const gerado = `Gerado por ${usuarios[0]?.nome || 'usuário'} em ${dataHora(new Date())}`;
  const versao = pool.contextoAtual()?.versao;

  const porAno = new Map();
  dados.linhas.forEach((l) => {
    const ano = Number(l.data.slice(0, 4));
    if (!porAno.has(ano)) porAno.set(ano, []);
    porAno.get(ano).push(l);
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Horizon Finanças';
  workbook.created = new Date();

  dados.exercicios.forEach((ex) => {
    const linhas = porAno.get(ex.ano) || [];
    const sheet = workbook.addWorksheet(String(ex.ano), {
      views: [{ state: 'frozen', ySplit: LINHA_CABECALHO, showGridLines: false }],
    });
    COLUNAS.forEach((c, i) => {
      const col = sheet.getColumn(i + 1);
      col.width = c.largura;
    });
    const fim = ex.ano === Number(dados.posicao_em?.slice(0, 4)) ? dataBr(dados.posicao_em) : `31/12/${ex.ano}`;
    const total = linhas.reduce((s, l) => s + l.valor, 0);
    cabecalho(workbook, sheet, {
      titulo: `Financeiro da DRE — exercício ${ex.ano}`,
      subtitulo: `Títulos emitidos e movimentos de 01/01/${ex.ano} a ${fim} que entram na DRE (a listagem do exercício, sem filtro). Valor com sinal (saída negativa).`,
      filtros: [
        ['Empresa', empresa],
        ...(versao ? [['Versão da DRE', `${versao.numero}${versao.status === 'ABERTA' ? ' (em edição)' : ''}`]] : []),
        ['A receber', `${ex.receber} títulos`],
        ['A pagar', `${ex.pagar} títulos`],
        ['Movimentações', ex.movimentos],
        ['Linhas', linhas.length],
        ['Total', total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
      ],
      gerado,
      ultimaColuna: COLUNAS.length,
    });

    // Cabeçalho da tabela como o da tela: azul claro, texto azul, linha azul embaixo.
    COLUNAS.forEach((c, i) => {
      const cel = sheet.getCell(LINHA_CABECALHO, i + 1);
      cel.value = c.titulo.toUpperCase();
      cel.font = { bold: true, size: 9, color: { argb: CORES.AZUL } };
      cel.fill = preencher(CORES.AZUL_MUITO_CLARO);
      cel.alignment = { vertical: 'middle', horizontal: c.formato ? 'right' : 'left', wrapText: true };
      cel.border = { bottom: borda(CORES.AZUL, 'medium') };
    });
    sheet.getRow(LINHA_CABECALHO).height = 30;

    if (!linhas.length) {
      const cel = sheet.getCell(LINHA_CABECALHO + 1, 1);
      cel.value = 'Nenhum lançamento neste exercício.';
      cel.font = { size: 9, italic: true, color: { argb: CORES.CINZA } };
    }
    // Estilo por célula só no que muda; a GENESIS passa de 100 mil linhas.
    const fonte = { size: 9, color: { argb: CORES.CINZA_ESCURO } };
    linhas.forEach((l, i) => {
      const row = sheet.getRow(LINHA_CABECALHO + 1 + i);
      row.values = COLUNAS.map((c) => c.valor(l));
      COLUNAS.forEach((c, j) => {
        const cel = row.getCell(j + 1);
        cel.font = fonte;
        if (c.formato) cel.numFmt = c.formato;
      });
      if (l.valor < 0) row.getCell(COL_VALOR).font = { size: 9, color: { argb: CORES.VERMELHO } };
      if (COR_STATUS[l.status]) row.getCell(COL_STATUS).font = { size: 9, bold: true, color: { argb: COR_STATUS[l.status] } };
    });

    if (linhas.length) {
      const n = LINHA_CABECALHO + linhas.length + 1;
      const rotulo = sheet.getCell(n, COL_VALOR - 1);
      rotulo.value = 'Total';
      rotulo.font = { bold: true, size: 9, color: { argb: CORES.PRETO } };
      rotulo.alignment = { horizontal: 'right' };
      const soma = sheet.getCell(n, COL_VALOR);
      soma.value = { formula: `SUBTOTAL(9,${sheet.getColumn(COL_VALOR).letter}${LINHA_CABECALHO + 1}:${sheet.getColumn(COL_VALOR).letter}${n - 1})`, result: total };
      soma.numFmt = FORMATOS.moeda;
      soma.font = { bold: true, size: 9, color: { argb: CORES.PRETO } };
      for (let c = 1; c <= COLUNAS.length; c += 1) {
        sheet.getCell(n, c).fill = preencher(CORES.AZUL_MUITO_CLARO);
        sheet.getCell(n, c).border = { top: borda(CORES.AZUL, 'medium') };
      }
      sheet.autoFilter = { from: { row: LINHA_CABECALHO, column: 1 }, to: { row: n - 1, column: COLUNAS.length } };
    }
    impressao(sheet, `${LINHA_CABECALHO}:${LINHA_CABECALHO}`);
  });

  const buffer = await corrigirArquivo(await workbook.xlsx.writeBuffer());
  return { buffer, nome: `Financeiro DRE - ${empresa} - todos os exercícios.xlsx` };
}

module.exports = { gerar };
