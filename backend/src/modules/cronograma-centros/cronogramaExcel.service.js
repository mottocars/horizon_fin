const ExcelJS = require('exceljs');

// Planilha de uma versão do cronograma de obras — o anexo do comunicado de WhatsApp e o download da
// aba Versões de Cronogramas Obras (cronogramaVersoes.service.js). É o espelho do cronograma da tela
// (pedido do usuário), montada do retrato guardado na versão:
// - Cronograma: uma linha por obra — início, fim e duração de cada etapa, a etapa de hoje e o atraso;
// - Gantt: mês a mês, nas cores das etapas e com os meses em atraso na cor do atraso;
// - Alterações: o que mudou nesta versão;
// - Versão: quem gravou, quando, a observação e o link do dashboard.
// As contas de data e de atraso são as mesmas da tela (frontend: CentrosCusto/cronogramaDatas.js e
// Operacoes/CronogramasObras/cronogramaObras.js).

const COR_ATRASO_PADRAO = '#dc2626';
const CORES_PADRAO = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#f97316'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const AZUL = 'FF1E40AF';
const AMARELO_ALTERADA = 'FFFFF4CC';
const MS_DIA = 86400000;
const DIAS_MES = 365.25 / 12;
const LIMITE_MESES_GANTT = 300;

// ----- datas ('AAAA-MM-DD', contas em UTC)
const utc = (d) => {
  const [a, m, dia] = d.split('-').map(Number);
  return Date.UTC(a, m - 1, dia);
};
const deUtc = (ms) => new Date(ms).toISOString().slice(0, 10);
const somarDias = (d, n) => deUtc(utc(d) + n * MS_DIA);
function somarMeses(d, n) {
  const [a, m, dia] = d.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return deUtc(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(dia, ultimoDia)));
}
const mesesEntre = (de, ate) => Math.round((utc(ate) - utc(de)) / MS_DIA / DIAS_MES);
const anosEntre = (de, ate) => Math.round((utc(ate) - utc(de)) / MS_DIA / 365.25);
const idxMes = (d) => {
  const [a, m] = d.split('-').map(Number);
  return a * 12 + m - 1;
};
const rotuloMes = (idx) => `${MESES[idx % 12]}/${String(Math.floor(idx / 12)).slice(2)}`;
const mesAno = (d) => (d ? `${MESES[Number(d.slice(5, 7)) - 1]}/${d.slice(0, 4)}` : '');
const dataExcel = (d) => (d ? new Date(utc(d)) : null);
function hojeSp() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
const argb = (hex) => `FF${String(hex || '#9ca3af').replace('#', '').toUpperCase()}`;
const preenchimento = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });

// Segmentos da obra (um por etapa com início) — fim e duração como montarSegmentos da tela.
function segmentos(centro, etapas) {
  return etapas
    .map((etapa, i) => {
      const inicio = centro.datas?.[etapa.id];
      if (!inicio) return null;
      const ultima = i === etapas.length - 1;
      const inicioSeguinte = ultima ? null : centro.datas[etapas[i + 1].id];
      const fimGravado = ultima ? centro.data_termino : centro.fins?.[etapa.id];
      const calculado = ultima ? fimGravado : inicioSeguinte ? somarDias(inicioSeguinte, -1) : fimGravado;
      const fim = calculado && calculado >= inicio ? calculado : null;
      let duracao = null;
      if (ultima) duracao = fimGravado ? anosEntre(inicio, fimGravado) : null;
      else if (inicioSeguinte) duracao = mesesEntre(inicio, inicioSeguinte);
      else if (fimGravado) duracao = mesesEntre(inicio, somarDias(fimGravado, 1));
      return { etapa, cor: etapa.cor || CORES_PADRAO[i % CORES_PADRAO.length], inicio, fim, duracao, ultima };
    })
    .filter(Boolean);
}

// Janela do atraso da construção (Regra de Atraso da Construção) — como prazoConstrucao/aplicarAtraso
// da tela: de `desde` até o fim da etapa da construção. null sem regra ou sem como medir.
function janelaAtraso(centro, segs, atraso) {
  if (!atraso || !segs.length) return null;
  const construcao = segs.find((s) => s.etapa.id === atraso.etapaId);
  if (!construcao || !construcao.fim) return null;
  let desde = null;
  if (atraso.regra === 'FIXA') desde = somarMeses(construcao.inicio, atraso.meses);
  else if (centro.prevision_base_100) desde = somarMeses(`${centro.prevision_base_100.slice(0, 8)}01`, 1);
  if (!desde) return null;
  if (desde < segs[0].inicio) desde = segs[0].inicio;
  if (desde > construcao.fim) return null;
  return { desde, ate: construcao.fim, meses: Math.max(1, mesesEntre(desde, somarDias(construcao.fim, 1))) };
}

function situacaoHoje(segs, hoje) {
  if (!segs.length) return 'Sem datas';
  const emCurso = segs.filter((s) => s.inicio <= hoje && (!s.fim || hoje <= s.fim)).at(-1);
  if (emCurso) return emCurso.etapa.descricao;
  if (hoje < segs[0].inicio) return 'A iniciar';
  return 'Concluída';
}

function estilizarCabecalho(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  row.alignment = { vertical: 'middle', wrapText: true };
}

async function gerar({ empresa, versao, link }) {
  const { etapas = [], atraso = null, centros = [] } = versao.cronograma || {};
  const hoje = hojeSp();
  const corAtraso = atraso?.cor || COR_ATRASO_PADRAO;
  const alteradas = new Set((versao.alteracoes || []).map((a) => a.sienge_id));
  const nome = (c) => String(c.apelido || '').trim() || String(c.name || '').trim();
  const obras = centros
    .map((c) => {
      const segs = segmentos(c, etapas);
      return { c, segs, janela: janelaAtraso(c, segs, atraso) };
    })
    .sort((a, b) => (a.segs[0]?.inicio || '9999').localeCompare(b.segs[0]?.inicio || '9999') || nome(a.c).localeCompare(nome(b.c), 'pt-BR'));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Horizon Finanças';

  // ----- Cronograma
  const sheet = workbook.addWorksheet('Cronograma', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  const colunas = [
    { header: 'Empreendimento', key: 'nome', width: 26 },
    { header: 'Código Sienge', key: 'sienge', width: 12 },
    { header: 'VGV', key: 'vgv', width: 17, numFmt: '"R$" #,##0.00' },
    { header: 'Unidades', key: 'unidades', width: 10, numFmt: '#,##0' },
  ];
  etapas.forEach((e, i) => {
    const ultima = i === etapas.length - 1;
    colunas.push(
      { header: `${e.descricao} — início`, key: `i${e.id}`, width: 13, numFmt: 'dd/mm/yyyy' },
      { header: `${e.descricao} — fim`, key: `f${e.id}`, width: 13, numFmt: 'dd/mm/yyyy' },
      { header: `${e.descricao} — duração (${ultima ? 'anos' : 'meses'})`, key: `d${e.id}`, width: 12, numFmt: '0' }
    );
  });
  colunas.push(
    { header: 'Etapa hoje', key: 'hoje', width: 14 },
    { header: 'Meses em atraso', key: 'atraso', width: 11, numFmt: '0' },
    { header: 'Atraso desde', key: 'desde', width: 12 },
    { header: 'Em atraso hoje', key: 'atrasadaHoje', width: 10 },
    { header: 'Alterada nesta versão', key: 'alterada', width: 11 }
  );
  sheet.columns = colunas.map(({ header, key, width }) => ({ header, key, width }));
  for (const { c, segs, janela } of obras) {
    const valores = {
      nome: nome(c),
      sienge: c.sienge_id,
      vgv: c.valor_geral_vendas != null ? Number(c.valor_geral_vendas) : null,
      unidades: c.numero_unidades ?? null,
      hoje: situacaoHoje(segs, hoje),
      atraso: janela?.meses ?? null,
      desde: janela ? mesAno(janela.desde) : null,
      atrasadaHoje: janela && janela.desde <= hoje && hoje <= janela.ate ? 'Sim' : 'Não',
      alterada: alteradas.has(c.sienge_id) ? 'Sim' : '',
    };
    segs.forEach((s) => {
      valores[`i${s.etapa.id}`] = dataExcel(s.inicio);
      valores[`f${s.etapa.id}`] = dataExcel(s.fim);
      valores[`d${s.etapa.id}`] = s.duracao;
    });
    const row = sheet.addRow(valores);
    if (alteradas.has(c.sienge_id)) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARELO_ALTERADA } };
      });
      row.getCell('alterada').font = { bold: true };
    }
    if (valores.atrasadaHoje === 'Sim') row.getCell('atrasadaHoje').font = { bold: true, color: { argb: argb(corAtraso) } };
  }
  colunas.forEach((col) => {
    if (col.numFmt) sheet.getColumn(col.key).numFmt = col.numFmt;
  });
  estilizarCabecalho(sheet.getRow(1));
  sheet.getRow(1).height = 32;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };

  // ----- Gantt
  const gantt = workbook.addWorksheet('Gantt', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
  const marcos = [hoje];
  obras.forEach(({ segs }) => segs.forEach((s) => marcos.push(s.inicio, s.fim || s.inicio)));
  const ini = Math.min(...marcos.map(idxMes));
  const fim = Math.min(Math.max(...marcos.map(idxMes)), ini + LIMITE_MESES_GANTT - 1);
  const qtdMeses = fim - ini + 1;
  const idxHoje = idxMes(hoje);
  gantt.getColumn(1).width = 26;
  for (let k = 0; k < qtdMeses; k++) gantt.getColumn(k + 2).width = 4.2;
  // linha 1: os anos (mesclados); linha 2: os meses
  gantt.getCell(1, 1).value = 'Empreendimento';
  gantt.mergeCells(1, 1, 2, 1);
  for (let k = 0; k < qtdMeses; k++) {
    const m = ini + k;
    if (k === 0 || m % 12 === 0) {
      const ateFimDoAno = Math.min(qtdMeses - 1, k + (11 - (m % 12)));
      gantt.getCell(1, k + 2).value = Math.floor(m / 12);
      if (ateFimDoAno > k) gantt.mergeCells(1, k + 2, 1, ateFimDoAno + 2);
    }
    gantt.getCell(2, k + 2).value = MESES[m % 12].charAt(0).toUpperCase();
  }
  [1, 2].forEach((r) => {
    estilizarCabecalho(gantt.getRow(r));
    gantt.getRow(r).alignment = { horizontal: 'center', vertical: 'middle' };
  });
  // o mês de hoje em destaque na régua
  if (idxHoje >= ini && idxHoje <= fim) gantt.getCell(2, idxHoje - ini + 2).font = { bold: true, color: { argb: 'FFFCA5A5' } };
  obras.forEach(({ c, segs, janela }, n) => {
    const r = n + 3;
    gantt.getCell(r, 1).value = nome(c);
    if (alteradas.has(c.sienge_id)) gantt.getCell(r, 1).font = { bold: true };
    for (let k = 0; k < qtdMeses; k++) {
      const m = ini + k;
      const seg = segs.filter((s) => idxMes(s.inicio) <= m && m <= idxMes(s.fim || s.inicio)).at(-1);
      if (!seg) continue;
      const noAtraso = janela && idxMes(janela.desde) <= m && m <= idxMes(janela.ate);
      const cel = gantt.getCell(r, k + 2);
      cel.fill = preenchimento(noAtraso ? corAtraso : seg.cor);
      cel.border = { left: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
    }
  });
  // legenda embaixo
  const rLegenda = obras.length + 4;
  gantt.getCell(rLegenda, 1).value = 'Legenda';
  gantt.getCell(rLegenda, 1).font = { bold: true };
  const itensLegenda = [
    ...etapas.map((e, i) => ({ cor: e.cor || CORES_PADRAO[i % CORES_PADRAO.length], texto: e.descricao })),
    ...(atraso ? [{ cor: corAtraso, texto: 'Atraso' }] : []),
  ];
  itensLegenda.forEach((item, i) => {
    gantt.getCell(rLegenda + 1 + i, 2).fill = preenchimento(item.cor);
    gantt.getCell(rLegenda + 1 + i, 3).value = item.texto;
  });

  // ----- Alterações
  const alt = workbook.addWorksheet('Alterações', { views: [{ state: 'frozen', ySplit: 1 }] });
  alt.columns = [
    { header: 'Empreendimento', key: 'nome', width: 26 },
    { header: 'Etapa', key: 'etapa', width: 16 },
    { header: 'Início antes', key: 'inicioAntes', width: 13 },
    { header: 'Início depois', key: 'inicioDepois', width: 13 },
    { header: 'Fim antes', key: 'fimAntes', width: 13 },
    { header: 'Fim depois', key: 'fimDepois', width: 13 },
    { header: 'Alterado por', key: 'por', width: 22 },
  ];
  for (const obra of versao.alteracoes || []) {
    for (const m of obra.etapas) {
      const row = alt.addRow({
        nome: obra.nome,
        etapa: m.etapa,
        inicioAntes: dataExcel(m.inicio_antes),
        inicioDepois: dataExcel(m.inicio_depois),
        fimAntes: dataExcel(m.fim_antes),
        fimDepois: dataExcel(m.fim_depois),
        por: obra.atualizado_por || '',
      });
      if (m.inicio_antes !== m.inicio_depois) row.getCell('inicioDepois').font = { bold: true };
      if (m.fim_antes !== m.fim_depois) row.getCell('fimDepois').font = { bold: true };
    }
  }
  ['inicioAntes', 'inicioDepois', 'fimAntes', 'fimDepois'].forEach((k) => {
    alt.getColumn(k).numFmt = 'dd/mm/yyyy';
  });
  estilizarCabecalho(alt.getRow(1));

  // ----- Versão
  const sobre = workbook.addWorksheet('Versão');
  sobre.getColumn(1).width = 22;
  sobre.getColumn(2).width = 70;
  const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(
    new Date(versao.criado_em)
  );
  const regra = !atraso
    ? 'Sem regra de atraso'
    : atraso.regra === 'FIXA'
      ? `Regra fixa: ${atraso.meses} meses de construção`
      : 'Planejamento do Prevision (mês em que a curva S de base chega a 100%)';
  const linhas = [
    ['Empresa', empresa],
    ['Versão', versao.numero],
    ['Gravada em', quando],
    ['Gravada por', versao.criado_por_nome || ''],
    ['Observação', versao.observacao || ''],
    ['Obras alteradas', (versao.alteracoes || []).map((a) => a.nome).join(', ')],
    ['Regra de atraso', regra],
    ['Dashboard', link ? { text: link, hyperlink: link } : ''],
  ];
  linhas.forEach(([k, v]) => {
    const row = sobre.addRow([k, v]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    if (v && v.hyperlink) row.getCell(2).font = { color: { argb: 'FF1D4ED8' }, underline: true };
  });

  return workbook.xlsx.writeBuffer();
}

module.exports = { gerar };
