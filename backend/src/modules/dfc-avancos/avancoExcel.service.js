const ExcelJS = require('exceljs');
const env = require('../../config/env');
const empresasService = require('../empresas/empresas.service');
const cronograma = require('../cronograma-centros/cronogramaCentros.service');
const { segmentos } = require('../cronograma-centros/cronogramaExcel.service');
const { curvasPorData } = require('./dfcAvancos.service');
const { VISOES, periodoDe, periodosEntre, periodoAnterior, rotulo, valorEm, somar, dataBr } = require('./periodosAvanco');

// Obra 360º › Avanço das Obras: o Excel do botão de download (pedido do usuário), com os filtros da
// tela — Obras (?obra=), Visão (mensal | semanal | diaria) e De/Até. Três abas:
// - Resumo: uma linha por obra, como os cards — etapa da carteira hoje, PLS (realizado e a data da
//   última parcela liberada), Principal e Secundário (realizado até hoje × previsto no fim do período
//   da visão) e se a obra está finalizada (todas as curvas que ela tem em 100%, no fim da lista);
// - Avanços: o relatório empilhado — uma linha por obra × curva (PLS, Principal, Secundário) ×
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
const TOLERANCIA = 0.05; // ponto percentual: abaixo disso é arredondamento do Prevision (como na tela)
const vazio = (v) => v === null || v === undefined;
const ate100 = (v) => (vazio(v) ? null : Math.min(v, 100));
const fracao = (v) => (vazio(v) ? null : Math.round(v * 100) / 10000); // % → fração do Excel (0,5133)
const pp = (v) => (vazio(v) ? null : Math.round(v * 100) / 100);
const dataExcel = (iso) => (iso ? new Date(`${iso}T00:00:00Z`) : null);
const nomeObra = (o) => String(o.apelido || '').trim() || String(o.name || '').trim();

const CURVAS = [
  { chave: 'pls', rotulo: 'PLS (Caixa)' },
  { chave: 'primaria', rotulo: 'Principal (Prevision)' },
  { chave: 'secundaria', rotulo: 'Secundário (Prevision)' },
];
// As séries de uma curva: { previsto, realizado } em [[data, %]...] (o PLS só tem o realizado).
const seriesDa = (obra, chave) =>
  chave === 'pls' ? (obra.pls ? { previsto: null, realizado: obra.pls.pontos } : null) : obra[chave] || null;

// Etapa da carteira hoje, com o mês dela como no Gantt ("17 de 30").
const idxMes = (iso) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const posMes = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return idxMes(iso) + (d - 1) / new Date(Date.UTC(a, m, 0)).getUTCDate();
};
function etapaHoje(centro, etapas, hoje) {
  if (!centro) return { nome: 'Sem cronograma', mes: '' };
  const segs = segmentos(centro, etapas);
  if (!segs.length) return { nome: 'Sem cronograma', mes: '' };
  const seg = segs.filter((s) => s.inicio <= hoje && (!s.fim || hoje <= s.fim)).at(-1);
  if (!seg) return { nome: hoje < segs[0].inicio ? 'A iniciar' : 'Concluída', mes: '' };
  const total = seg.fim ? Math.max(1, Math.round(posMes(somar(seg.fim, 1)) - posMes(seg.inicio))) : null;
  const atual = idxMes(hoje) - idxMes(seg.inicio) + 1;
  return { nome: seg.etapa.descricao, mes: total ? `${Math.min(atual, total)} de ${total}` : String(atual) };
}

// Recorte da obra (o mesmo dos gráficos): início = primeiro avanço de qualquer curva; fim = o dia em que
// a última curva chega a 100% ou, se alguma não chega, o último ponto e hoje.
function recorteDaObra(obra, hoje) {
  let ini = null;
  let fim = hoje;
  CURVAS.forEach(({ chave }) => {
    const s = seriesDa(obra, chave);
    if (!s) return;
    const lista = [s.previsto, s.realizado].filter(Boolean);
    let fimCurva = null;
    let todasCem = lista.length > 0;
    lista.forEach((pontos) => {
      const primeiro = pontos.find((p) => p[1] > 0);
      if (primeiro && (!ini || primeiro[0] < ini)) ini = primeiro[0];
      const cem = pontos.find((p) => p[1] >= 99.95);
      if (!cem) todasCem = false;
      const f = cem ? cem[0] : pontos[pontos.length - 1][0];
      if (!fimCurva || f > fimCurva) fimCurva = f;
    });
    if (fimCurva && !todasCem && fimCurva < hoje) fimCurva = hoje;
    if (fimCurva && fimCurva > fim) fim = fimCurva;
  });
  return { ini: ini || hoje, fim };
}

function periodosDaObra(obra, { visao, de, ate, hoje }) {
  const { ini, fim } = recorteDaObra(obra, hoje);
  if (de || ate) {
    const a = de || ini;
    const b = ate && ate < fim ? ate : fim;
    return periodosEntre(visao, a, b < a ? a : b);
  }
  const lista = periodosEntre(visao, ini, fim < ini ? ini : fim);
  lista.unshift(periodoAnterior(visao, lista[0]));
  return lista;
}

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
    .map((o) => {
      const col = (chave) => {
        const s = seriesDa(o, chave);
        if (!s) return null;
        return {
          realizado: ate100(valorEm(s.realizado, hoje)),
          previsto: s.previsto ? ate100(valorEm(s.previsto, fimPeriodo)) : null,
        };
      };
      const c = { obra: o, nome: nomeObra(o), pls: col('pls'), primaria: col('primaria'), secundaria: col('secundaria') };
      const realizados = CURVAS.map((k) => c[k.chave]).filter(Boolean).map((x) => x.realizado);
      c.finalizada = realizados.length > 0 && realizados.every((v) => !vazio(v) && v >= 99.95);
      return c;
    })
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
    { header: 'Principal realizado', key: 'priReal', width: 11 },
    { header: `Principal previsto (${refPrevisto})`, key: 'priPrev', width: 13 },
    { header: 'Principal desvio (p.p.)', key: 'priDesv', width: 11 },
    { header: 'Secundário realizado', key: 'secReal', width: 11 },
    { header: `Secundário previsto (${refPrevisto})`, key: 'secPrev', width: 13 },
    { header: 'Secundário desvio (p.p.)', key: 'secDesv', width: 11 },
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
      const s = seriesDa(c.obra, chave);
      if (!s) return;
      // Realizado: só até hoje (no período de hoje, o acumulado de hoje); depois, em branco.
      const real = (dia) => (dia > hoje ? null : ate100(valorEm(s.realizado, dia)));
      const prev = (dia) => (s.previsto ? ate100(valorEm(s.previsto, dia)) : null);
      periodos.forEach((p) => {
        const antes = somar(p.ini, -1);
        const realAcc = p.ini > hoje ? null : real(p.fim < hoje ? p.fim : hoje);
        const prevAcc = prev(p.fim);
        const realPer = vazio(realAcc) ? null : realAcc - (real(antes) || 0);
        const prevPer = vazio(prevAcc) ? null : prevAcc - (prev(antes) || 0);
        const d = !vazio(realAcc) && !vazio(prevAcc) ? realAcc - prevAcc : null;
        const row = sheet.addRow({
          nome: c.nome,
          sienge: c.obra.sienge_id,
          curva: nomeCurva,
          periodo: rotulo(visao, p),
          ini: dataExcel(p.ini),
          fim: dataExcel(p.fim),
          prevAcc: fracao(prevAcc),
          realAcc: fracao(realAcc),
          desvio: pp(d),
          prevPer: fracao(prevPer),
          realPer: fracao(realPer),
          situacao: vazio(d) ? '' : -d >= TOLERANCIA ? 'Abaixo do previsto' : 'Em dia',
        });
        row.getCell('bloco').value = k % 2; // obra sim, obra não (faixa, pela formatação condicional)
        row.getCell('hoje').value = p.ini <= hoje && hoje <= p.fim ? 'Sim' : '';
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
    ['Fontes', 'PLS: cronograma físico-financeiro do DCD (Caixa), só as parcelas liberadas · Principal e Secundário: curva S do Prevision'],
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
