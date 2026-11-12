const ExcelJS = require('exceljs');
const env = require('../../config/env');
const empresasService = require('../empresas/empresas.service');
const cronograma = require('../cronograma-centros/cronogramaCentros.service');
const { curvasPorData } = require('./dfcAvancos.service');
const { VISOES, periodoDe, dataBr } = require('./periodosAvanco');
const { TOLERANCIA, CURVAS, etapaHoje, cardsDaObra, periodosDaObra, linhasDaCurva } = require('./avancoObras');

// Obra 360º › Avanço das Obras: o Excel do botão de download (pedido do usuário), com os filtros da
// tela — Obras (?obra=), Visão (mensal | semanal | diaria) e De/Até. Três abas:
// - Resumo: uma linha por obra, como os cards — etapa da carteira hoje, PLS (realizado e a data da
//   última parcela liberada), Curva S de Obras e Curva S PLS (orçamentos primário e secundário do Prevision: realizado até hoje × previsto no fim do período
//   da visão) e se a obra está finalizada (todas as curvas que ela tem em 100%, no fim da lista);
// - Avanços: o relatório empilhado — uma linha por obra × curva (PLS, Curva S de Obras, Curva S PLS) ×
//   período da visão, com o acumulado previsto e realizado, o desvio, o avanço do próprio período e a
//   situação; o recorte de cada obra é o dos gráficos da tela (sem De/Até, a obra inteira: do período
//   antes do primeiro avanço até o dia em que o previsto chega a 100%; com De/Até, sem passar disso);
// - Filtros: empresa, visão, período, obras e quando foi gerado.
// As contas são as mesmas da tela (frontend: CronogramasObras/CurvasAvanco.jsx e periodosAvanco.js).

const AZUL = 'FF1E40AF';
const FAIXA = 'FFF2F5F6'; // obra sim, obra não, para separar os blocos do empilhado
const VERMELHO = 'FFB42D2D';
const VERDE = 'FF0A7A0A';
const PCT = '0.00%';
const PP = '+0.00;-0.00;0.00';
const vazio = (v) => v === null || v === undefined;
const fracao = (v) => (vazio(v) ? null : Math.round(v * 100) / 10000); // % → fração do Excel (0,5133)
const pp = (v) => (vazio(v) ? null : Math.round(v * 100) / 100);
const dataExcel = (iso) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

function cabecalho(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 32;
}
const pintar = (row, argb) =>
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  });

async function gerar(empresaId, { visao = 'mensal', de = '', ate = '', obras: marcadas = [] }) {
  const [dados, retrato, empresa] = await Promise.all([
    curvasPorData(empresaId),
    cronograma.list(empresaId),
    empresasService.getById(empresaId),
  ]);
  const { hoje } = dados;
  const nomeEmpresa = empresa?.nome_fantasia?.trim() || empresa?.razao_social || '';
  const centros = new Map(retrato.centros.map((c) => [c.sienge_id, c]));
  const fimPeriodo = periodoDe(visao, hoje).fim;

  // As obras do filtro, como na tela: em ordem do nome exibido, as finalizadas no fim.
  const cards = dados.obras
    .filter((o) => !marcadas.length || marcadas.includes(String(o.sienge_id)))
    .map((o) => cardsDaObra(o, hoje, fimPeriodo))
    .sort((a, b) => a.finalizada - b.finalizada || a.nome.localeCompare(b.nome, 'pt-BR'));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Horizon Finanças';

  // ----- Resumo (os cards)
  const resumo = workbook.addWorksheet('Resumo', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  const refPrevisto = visao === 'diaria' ? 'hoje' : visao === 'semanal' ? 'fim da semana' : 'fim do mês';
  resumo.columns = [
    { header: 'Empreendimento', key: 'nome', width: 24 },
    { header: 'Código Sienge', key: 'sienge', width: 10 },
    { header: 'Centro de custo (Sienge)', key: 'centro', width: 34 },
    { header: 'Etapa da carteira hoje', key: 'etapa', width: 18 },
    { header: 'Mês da etapa', key: 'mesEtapa', width: 10 },
    { header: 'PLS realizado', key: 'plsReal', width: 11 },
    { header: 'PLS até (última parcela liberada)', key: 'plsAte', width: 15 },
    { header: 'Curva S de Obras realizado', key: 'priReal', width: 12 },
    { header: `Curva S de Obras previsto (${refPrevisto})`, key: 'priPrev', width: 14 },
    { header: 'Curva S de Obras desvio (p.p.)', key: 'priDesv', width: 12 },
    { header: 'Curva S PLS realizado', key: 'secReal', width: 12 },
    { header: `Curva S PLS previsto (${refPrevisto})`, key: 'secPrev', width: 14 },
    { header: 'Curva S PLS desvio (p.p.)', key: 'secDesv', width: 12 },
    { header: 'Situação', key: 'situacao', width: 14 },
  ];
  const desvio = (col) => (col && !vazio(col.realizado) && !vazio(col.previsto) ? col.realizado - col.previsto : null);
  cards.forEach((c) => {
    const etapa = etapaHoje(centros.get(c.obra.sienge_id), retrato.etapas, hoje);
    const row = resumo.addRow({
      nome: c.nome,
      sienge: c.obra.sienge_id,
      centro: c.obra.name,
      etapa: etapa.nome,
      mesEtapa: etapa.mes,
      plsReal: fracao(c.pls?.realizado),
      plsAte: c.pls ? dataExcel(c.obra.pls.ultima_liberacao) : 'sem Caixa',
      priReal: c.primaria ? fracao(c.primaria.realizado) : 'sem orçamento',
      priPrev: fracao(c.primaria?.previsto),
      priDesv: pp(desvio(c.primaria)),
      secReal: c.secundaria ? fracao(c.secundaria.realizado) : 'sem orçamento',
      secPrev: fracao(c.secundaria?.previsto),
      secDesv: pp(desvio(c.secundaria)),
      situacao: c.finalizada ? 'Finalizada' : 'Em andamento',
    });
    ['priDesv', 'secDesv'].forEach((k) => {
      const v = row.getCell(k).value;
      if (!vazio(v)) row.getCell(k).font = { bold: true, color: { argb: v <= -TOLERANCIA ? VERMELHO : VERDE } };
    });
    if (c.finalizada) pintar(row, FAIXA);
  });
  ['plsReal', 'priReal', 'priPrev', 'secReal', 'secPrev'].forEach((k) => (resumo.getColumn(k).numFmt = PCT));
  ['priDesv', 'secDesv'].forEach((k) => (resumo.getColumn(k).numFmt = PP));
  resumo.getColumn('plsAte').numFmt = 'dd/mm/yyyy';
  cabecalho(resumo.getRow(1));
  resumo.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: resumo.columns.length } };

  // ----- Avanços (empilhado: obra × curva × período)
  const sheet = workbook.addWorksheet('Avanços', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  sheet.columns = [
    { header: 'Empreendimento', key: 'nome', width: 24 },
    { header: 'Código Sienge', key: 'sienge', width: 10 },
    { header: 'Curva', key: 'curva', width: 20 },
    { header: `Período (${VISOES[visao].toLowerCase()})`, key: 'periodo', width: visao === 'semanal' ? 28 : 13 },
    { header: 'Início', key: 'ini', width: 11 },
    { header: 'Fim', key: 'fim', width: 11 },
    { header: 'Previsto acumulado', key: 'prevAcc', width: 12 },
    { header: 'Realizado acumulado', key: 'realAcc', width: 12 },
    { header: 'Desvio acumulado (p.p.)', key: 'desvio', width: 11 },
    { header: 'Previsto no período', key: 'prevPer', width: 11 },
    { header: 'Realizado no período', key: 'realPer', width: 11 },
    { header: 'Situação', key: 'situacao', width: 18 },
    { header: 'Período de hoje', key: 'hoje', width: 9 },
    { header: 'bloco', key: 'bloco', width: 4, hidden: true },
  ];
  cards.forEach((c, k) => {
    const periodos = periodosDaObra(c.obra, { visao, de, ate, hoje });
    CURVAS.forEach(({ chave, rotulo: nomeCurva }) => {
      // Realizado: só até hoje (no período de hoje, o acumulado de hoje); depois, em branco.
      (linhasDaCurva(c.obra, chave, periodos, { visao, hoje }) || []).forEach((l) => {
        const row = sheet.addRow({
          nome: c.nome,
          sienge: c.obra.sienge_id,
          curva: nomeCurva,
          periodo: l.periodo,
          ini: dataExcel(l.ini),
          fim: dataExcel(l.fim),
          prevAcc: fracao(l.previstoAcumulado),
          realAcc: fracao(l.realizadoAcumulado),
          desvio: pp(l.desvio),
          prevPer: fracao(l.previstoNoPeriodo),
          realPer: fracao(l.realizadoNoPeriodo),
          situacao: l.situacao,
        });
        row.getCell('bloco').value = k % 2; // obra sim, obra não (faixa, pela formatação condicional)
        row.getCell('hoje').value = l.hoje ? 'Sim' : '';
      });
    });
  });
  ['prevAcc', 'realAcc', 'prevPer', 'realPer'].forEach((k) => (sheet.getColumn(k).numFmt = PCT));
  sheet.getColumn('desvio').numFmt = PP;
  ['ini', 'fim'].forEach((k) => (sheet.getColumn(k).numFmt = 'dd/mm/yyyy'));
  sheet.getColumn('bloco').hidden = true;
  // Cores por formatação condicional (uma regra para a coluna inteira, não célula a célula — a visão
  // diária passa de 30 mil linhas): faixa por obra, período de hoje em negrito, desvio e situação em
  // vermelho (abaixo do previsto) ou verde (em dia).
  const ultimaLinha = Math.max(2, sheet.rowCount);
  const faixa = `A2:N${ultimaLinha}`;
  sheet.addConditionalFormatting({
    ref: faixa,
    rules: [
      { type: 'expression', priority: 3, formulae: ['$N2=1'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: FAIXA } } } },
      { type: 'expression', priority: 2, formulae: ['$M2="Sim"'], style: { font: { bold: true } } },
    ],
  });
  sheet.addConditionalFormatting({
    ref: `I2:I${ultimaLinha} L2:L${ultimaLinha}`,
    rules: [
      { type: 'expression', priority: 1, formulae: ['$L2="Abaixo do previsto"'], style: { font: { bold: true, color: { argb: VERMELHO } } } },
      { type: 'expression', priority: 4, formulae: ['$L2="Em dia"'], style: { font: { bold: true, color: { argb: VERDE } } } },
    ],
  });
  cabecalho(sheet.getRow(1));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length - 1 } };

  // ----- Filtros
  const filtros = workbook.addWorksheet('Filtros');
  filtros.getColumn(1).width = 26;
  filtros.getColumn(2).width = 90;
  const params = new URLSearchParams({ tela: 'avancos', empresa_id: String(empresaId) });
  marcadas.forEach((o) => params.append('obra', o));
  if (visao !== 'mensal') params.set('visao', visao);
  if (de) params.set('de', de);
  if (ate) params.set('ate', ate);
  const link = `${env.frontendUrl.replace(/\/+$/, '')}/dashboards/cronogramas-obras?${params}`;
  const linhas = [
    ['Relatório', 'Obra 360º › Avanço das Obras'],
    ['Empresa', nomeEmpresa],
    ['Obras', marcadas.length ? cards.map((c) => c.nome).join(', ') : `Todas as obras (${cards.length})`],
    ['Visão', `${VISOES[visao]}${visao === 'semanal' ? ' (semana de domingo a sábado)' : ''}`],
    [
      'Período',
      de || ate
        ? `${de ? dataBr(de) : 'início da obra'} a ${ate ? dataBr(ate) : 'fim da obra'} (sem passar do dia em que o previsto chega a 100%)`
        : 'Obra inteira (do primeiro avanço até o previsto chegar a 100%)',
    ],
    [
      'Referência do Resumo',
      visao === 'diaria'
        ? `Realizado e previsto acumulados até hoje (${dataBr(hoje)})`
        : `Realizado acumulado até hoje (${dataBr(hoje)}) · previsto acumulado até o ${refPrevisto} (${dataBr(fimPeriodo)})`,
    ],
    ['Fontes', 'PLS: cronograma físico-financeiro do DCD (Caixa), só as parcelas liberadas · Curva S de Obras e Curva S PLS: orçamentos primário e secundário do Prevision (curva S)'],
    ['Situação', `"Abaixo do previsto" quando o realizado fica ${String(TOLERANCIA).replace('.', ',')} ponto ou mais abaixo do previsto`],
    ['Gerado em', new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date())],
    ['Dashboard', { text: link, hyperlink: link }],
  ];
  linhas.forEach(([k, v]) => {
    const row = filtros.addRow([k, v]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    if (v && v.hyperlink) row.getCell(2).font = { color: { argb: 'FF1D4ED8' }, underline: true };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const nomeArquivo = `Avanço das Obras - ${nomeEmpresa || `Empresa ${empresaId}`} - ${VISOES[visao]} - ${dataBr(hoje).replace(/\//g, '-')}.xlsx`;
  return { buffer, nomeArquivo };
}

module.exports = { gerar };
