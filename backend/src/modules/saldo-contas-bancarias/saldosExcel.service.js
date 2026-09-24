const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const service = require('./saldos.service');
const empresasService = require('../empresas/empresas.service');

// Logomarca completa (o mesmo wordmark do topo do menu lateral expandido, ver
// frontend/src/layout/Sidebar.jsx e frontend/public/logomarca.svg) — rasterizada em PNG porque
// exceljs só aceita PNG/JPEG em addImage, não SVG. Proporção original 96x40 (2.4:1).
const LOGO_PNG = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'logomarca.png'));

// Paleta de marca já usada nos documentos oficiais gerados pelo sistema (mesmo par
// azul/cinza de pdf.service.js::AZUL/CINZA, que é o mesmo azul do cabeçalho do
// relatório em tela — ver RelatorioSaldosImpressao.jsx).
const AZUL = 'FF1D4ED8';
const AZUL_CLARO = 'FFDBEAFE';
const AZUL_MUITO_CLARO = 'FFE8EEFB';
const CINZA = 'FF6B7280';
const PRETO = 'FF111827';
const BRANCO = 'FFFFFFFF';

const FORMATO_MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const BORDA_FINA = { style: 'thin', color: { argb: 'FFD1D5DB' } };
const TODAS_BORDAS = { top: BORDA_FINA, bottom: BORDA_FINA, left: BORDA_FINA, right: BORDA_FINA };

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

const SEMANA_CURTA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ---------------------------------------------------------------------------
// Preparação dos dados — mesma lógica que existia em constantes.js/SaldosContasTab.jsx
// no frontend, portada pro servidor (aritmética de Date local pura, sem parsing UTC).
// ---------------------------------------------------------------------------

function brData(iso) {
  return iso.split('-').reverse().join('/');
}

function listarDias(dataInicio, dataFim) {
  const [ai, mi, di] = dataInicio.split('-').map(Number);
  const [af, mf, df] = dataFim.split('-').map(Number);
  const cursor = new Date(ai, mi - 1, di);
  const limite = new Date(af, mf - 1, df);
  const dias = [];
  while (cursor <= limite) {
    dias.push({
      iso: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`,
      dia: cursor.getDate(),
      mes: cursor.getMonth(),
      ano: cursor.getFullYear(),
      semana: SEMANA_CURTA[cursor.getDay()],
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

// Agrupa dias consecutivos do mesmo mês — vira a mescla do cabeçalho de mês (uma semana
// pode cruzar virada de mês, ex. 27/set a 03/out).
function agruparMeses(dias) {
  const segmentos = [];
  for (const d of dias) {
    const ultimo = segmentos[segmentos.length - 1];
    if (ultimo && ultimo.mes === d.mes && ultimo.ano === d.ano) ultimo.dias += 1;
    else segmentos.push({ mes: d.mes, ano: d.ano, dias: 1 });
  }
  return segmentos;
}

// Soma em centavos (inteiros) pra não acumular erro de ponto flutuante nos totais.
function somarCentavos(valores) {
  return valores.reduce((acc, v) => acc + Math.round(Number(v) * 100), 0) / 100;
}

function nomeExibicaoEmpresa(empresa) {
  return empresa?.nome_fantasia?.trim() || empresa?.razao_social || '';
}

// Só entram contas com ao menos 1 saldo lançado na semana (pedido do usuário: "todos os
// saldos de todas as contas que possuem algum valor durante aquela semana") — uma conta sem
// nenhum valor no período não agrega nada ao relatório. Um grupo que fica sem nenhuma conta
// depois desse filtro também não aparece.
function agruparContas(contas) {
  const nomes = [...new Set(contas.map((c) => c.classificacao))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return nomes
    .map((nome) => ({ nome, contas: contas.filter((c) => c.classificacao === nome && Object.keys(c.saldos).length > 0) }))
    .filter((grupo) => grupo.contas.length > 0);
}

// Mesmo critério de agruparContas, mas por banco em vez de classificação — contas sem código de
// banco (BANCO_EFETIVO_SQL pode devolver NULL) caem num grupo "SEM_BANCO" só pra não sumir da
// planilha nem quebrar o sort (localeCompare não aceita null). O rótulo "Banco não identificado"
// pra esse grupo é montado em rotuloBanco, não aqui — aqui é só a chave.
function agruparContasPorBanco(contas) {
  const codigos = [...new Set(contas.map((c) => c.banco_codigo || 'SEM_BANCO'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return codigos
    .map((codigo) => ({
      nome: codigo,
      contas: contas.filter((c) => (c.banco_codigo || 'SEM_BANCO') === codigo && Object.keys(c.saldos).length > 0),
    }))
    .filter((grupo) => grupo.contas.length > 0);
}

function rotuloBanco(codigo, bancoNomes) {
  if (codigo === 'SEM_BANCO') return 'Banco não identificado';
  const nome = bancoNomes.get(codigo);
  return nome ? `${codigo} — ${nome}` : codigo;
}

function calcularTotais(grupos, dias) {
  const totaisPorGrupo = {};
  for (const grupo of grupos) {
    const porDia = {};
    for (const conta of grupo.contas) {
      for (const [data, valor] of Object.entries(conta.saldos)) (porDia[data] ||= []).push(valor);
    }
    totaisPorGrupo[grupo.nome] = Object.fromEntries(Object.entries(porDia).map(([data, valores]) => [data, somarCentavos(valores)]));
  }
  const totalGeral = {};
  for (const dia of dias) {
    const valores = grupos.map((g) => totaisPorGrupo[g.nome][dia.iso]).filter((v) => v !== undefined);
    if (valores.length) totalGeral[dia.iso] = somarCentavos(valores);
  }
  return { totaisPorGrupo, totalGeral };
}

// Textos legíveis dos filtros ativos (mesma lógica que antes vivia em
// SaldoContasBancariasPage.jsx::filtrosRelatorio, portada pro servidor — sempre inclui a
// semana, os demais só entram se estiverem realmente filtrando algo).
function montarFiltrosDisplay(filtrosQuery, opcoes) {
  const lista = [{ rotulo: 'Semana', valor: `${brData(filtrosQuery.dataInicio)} a ${brData(filtrosQuery.dataFim)}` }];
  if (filtrosQuery.companyIds.length) {
    const valores = filtrosQuery.companyIds.map(
      (id) => opcoes.empresas.find((e) => String(e.company_id) === String(id))?.company_name || String(id)
    );
    lista.push({ rotulo: 'Empresa da conta', valor: valores.join(', ') });
  }
  if (filtrosQuery.bancos.length) {
    const valores = filtrosQuery.bancos.map((codigo) => opcoes.bancos.find((b) => b.codigo === codigo)?.nome || codigo);
    lista.push({ rotulo: 'Banco', valor: valores.join(', ') });
  }
  if (filtrosQuery.contas.length) {
    const valores = filtrosQuery.contas.map((valor) => opcoes.contas.find((c) => c.value === valor)?.label || valor);
    lista.push({ rotulo: 'Conta bancária', valor: valores.join(', ') });
  }
  if (filtrosQuery.classificacoes.length) {
    lista.push({ rotulo: 'Classificação', valor: filtrosQuery.classificacoes.join(', ') });
  }
  return lista;
}

// ---------------------------------------------------------------------------
// Montagem da planilha
// ---------------------------------------------------------------------------

function celula(sheet, linha, coluna) {
  const c = sheet.getCell(linha, coluna);
  c.border = TODAS_BORDAS;
  return c;
}

function escreverFaixaTitulo(sheet, linha, texto, ultimaColuna) {
  sheet.mergeCells(linha, 1, linha, ultimaColuna);
  const c = celula(sheet, linha, 1);
  c.value = texto;
  c.font = { bold: true, size: 14, color: { argb: BRANCO } };
  c.alignment = { horizontal: 'center', vertical: 'middle' };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  for (let col = 2; col <= ultimaColuna; col++) {
    celula(sheet, linha, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  }
  sheet.getRow(linha).height = 22;
}

// 2 linhas: mês(es) mesclado(s) por cima dos dias daquele mês + dia da semana/número por
// coluna (ex. "DOM - 20"). `rotuloColuna1` é o texto da 1ª coluna, mesclado nas 2 linhas.
function escreverCabecalhoColunas(sheet, linhaMeses, rotuloColuna1, dias, meses, ultimaColuna) {
  sheet.mergeCells(linhaMeses, 1, linhaMeses + 1, 1);
  const c1 = celula(sheet, linhaMeses, 1);
  c1.value = rotuloColuna1;
  c1.font = { bold: true, size: 11, color: { argb: AZUL } };
  c1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_MUITO_CLARO } };
  celula(sheet, linhaMeses + 1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_MUITO_CLARO } };

  let coluna = 2;
  for (const seg of meses) {
    const inicio = coluna;
    const fim = coluna + seg.dias - 1;
    if (fim > inicio) sheet.mergeCells(linhaMeses, inicio, linhaMeses, fim);
    for (let col = inicio; col <= fim; col++) {
      const c = celula(sheet, linhaMeses, col);
      if (col === inicio) c.value = `${MESES[seg.mes]} de ${seg.ano}`.toUpperCase();
      c.font = { bold: true, size: 11, color: { argb: AZUL } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_MUITO_CLARO } };
    }
    coluna = fim + 1;
  }

  dias.forEach((dia, i) => {
    const c = celula(sheet, linhaMeses + 1, 2 + i);
    c.value = `${dia.semana} - ${String(dia.dia).padStart(2, '0')}`;
    c.font = { bold: true, size: 10, color: { argb: AZUL } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_MUITO_CLARO } };
  });

  sheet.getRow(linhaMeses).height = 18;
  sheet.getRow(linhaMeses + 1).height = 16;
}

function escreverValorDia(sheet, linha, coluna, valor) {
  const c = celula(sheet, linha, coluna);
  if (valor !== undefined) {
    c.value = valor;
    c.numFmt = FORMATO_MOEDA;
  }
  c.alignment = { horizontal: 'right', vertical: 'middle' };
  return c;
}

// `comFundo = false` deixa a linha sem preenchimento — pedido do usuário pras linhas de
// classificação da seção "Saldos por Classificação" não ficarem parecidas com a linha TOTAL
// (que continua destacada, é a única que deve chamar atenção ali).
function escreverLinhaGrupo(sheet, linha, texto, totais, dias, { total = false, comFundo = true } = {}) {
  const c1 = celula(sheet, linha, 1);
  c1.value = texto;
  c1.font = { bold: true, size: 11, color: { argb: total ? AZUL : PRETO } };
  c1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  if (comFundo) c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_CLARO } };
  dias.forEach((dia, i) => {
    const c = escreverValorDia(sheet, linha, 2 + i, totais[dia.iso]);
    c.font = { bold: true, size: 11 };
    if (comFundo) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_CLARO } };
  });
}

function escreverLinhaConta(sheet, linha, conta, dias) {
  const c1 = celula(sheet, linha, 1);
  const inativa = conta.status !== 'ENABLED';
  const nome = conta.nome || conta.numero_conta;
  c1.value = { richText: [
    { font: { size: 11, color: { argb: PRETO } }, text: `${conta.banco_codigo ? conta.banco_codigo + ' — ' : ''}${nome}` },
    ...(inativa ? [{ font: { size: 9, italic: true, color: { argb: CINZA } }, text: '  (Inativa)' }] : []),
  ] };
  c1.alignment = { horizontal: 'left', vertical: 'middle', indent: 3 };
  dias.forEach((dia, i) => {
    const c = escreverValorDia(sheet, linha, 2 + i, conta.saldos[dia.iso]);
    c.font = { size: 11, color: { argb: PRETO } };
  });
}

function montarPlanilha(workbook, dados) {
  const {
    empresaLabel, filtrosDisplay, nomeUsuario, geradoEm, dias, meses,
    grupos, totaisPorGrupo, totalGeral, gruposBanco, totaisPorBanco, bancoNomes,
  } = dados;
  const ultimaColuna = 1 + dias.length;
  const sheet = workbook.addWorksheet('Relatório', { views: [{ showGridLines: false }] });

  sheet.getColumn(1).width = 46;
  for (let col = 2; col <= ultimaColuna; col++) sheet.getColumn(col).width = 18.43;

  // ------------------------------------------------------------- cabeçalho (logo + título)
  sheet.mergeCells(1, 1, 3, 1);
  const cLogo = celula(sheet, 1, 1);
  cLogo.alignment = { horizontal: 'center', vertical: 'middle' };
  [1, 2, 3].forEach((linha) => {
    sheet.getRow(linha).height = 24;
    celula(sheet, linha, 1);
    for (let col = 2; col <= ultimaColuna; col++) celula(sheet, linha, col);
  });
  sheet.mergeCells(1, 2, 3, ultimaColuna);
  const cTitulo = celula(sheet, 1, 2);
  cTitulo.value = empresaLabel ? `RELATÓRIO DE SALDO DAS CONTAS BANCÁRIAS — ${empresaLabel}` : 'RELATÓRIO DE SALDO DAS CONTAS BANCÁRIAS';
  cTitulo.font = { bold: true, size: 14, color: { argb: PRETO } };
  cTitulo.alignment = { horizontal: 'center', vertical: 'middle' };
  cTitulo.border = { ...TODAS_BORDAS, bottom: { style: 'medium', color: { argb: AZUL } } };

  const imageId = workbook.addImage({ buffer: LOGO_PNG, extension: 'png' });
  sheet.addImage(imageId, { tl: { col: 0.2, row: 0.35 }, ext: { width: 130, height: 54 } });

  // ------------------------------------------------------------- filtros / gerado por
  const colsFiltros = Math.max(1, ultimaColuna - 3);
  sheet.mergeCells(4, 1, 4, colsFiltros);
  const cFiltros = celula(sheet, 4, 1);
  cFiltros.value = filtrosDisplay.map((f) => `${f.rotulo}: ${f.valor}`).join('   •   ');
  cFiltros.font = { size: 10, color: { argb: CINZA } };
  cFiltros.alignment = { horizontal: 'left', vertical: 'middle' };
  for (let col = 2; col <= colsFiltros; col++) celula(sheet, 4, col);

  sheet.mergeCells(4, colsFiltros + 1, 4, ultimaColuna);
  const cGerado = celula(sheet, 4, colsFiltros + 1);
  cGerado.value = `Gerado por ${nomeUsuario} em ${geradoEm}`;
  cGerado.font = { size: 10, italic: true, color: { argb: CINZA } };
  cGerado.alignment = { horizontal: 'right', vertical: 'middle' };
  for (let col = colsFiltros + 2; col <= ultimaColuna; col++) celula(sheet, 4, col);
  sheet.getRow(4).height = 20;

  let linha = 6;

  // ------------------------------------------------------------- saldos por banco
  escreverFaixaTitulo(sheet, linha, 'SALDOS POR BANCO', ultimaColuna);
  linha += 1;
  escreverCabecalhoColunas(sheet, linha, 'BANCO', dias, meses, ultimaColuna);
  linha += 2;
  for (const grupo of gruposBanco) {
    escreverLinhaGrupo(sheet, linha, rotuloBanco(grupo.nome, bancoNomes), totaisPorBanco[grupo.nome], dias, { comFundo: false });
    linha += 1;
  }
  escreverLinhaGrupo(sheet, linha, 'TOTAL', totalGeral, dias, { total: true });
  linha += 2;

  // ------------------------------------------------------------- saldos por classificação
  escreverFaixaTitulo(sheet, linha, 'SALDOS POR CLASSIFICAÇÃO', ultimaColuna);
  linha += 1;
  escreverCabecalhoColunas(sheet, linha, 'CLASSIFICAÇÃO', dias, meses, ultimaColuna);
  linha += 2;
  for (const grupo of grupos) {
    escreverLinhaGrupo(sheet, linha, grupo.nome, totaisPorGrupo[grupo.nome], dias, { comFundo: false });
    linha += 1;
  }
  escreverLinhaGrupo(sheet, linha, 'TOTAL', totalGeral, dias, { total: true });
  linha += 2;

  // ------------------------------------------------------------- saldos por conta bancária
  escreverFaixaTitulo(sheet, linha, 'SALDOS POR CONTA BANCÁRIA', ultimaColuna);
  linha += 1;
  escreverCabecalhoColunas(sheet, linha, 'CLASSIFICAÇÃO / CONTA BANCÁRIA', dias, meses, ultimaColuna);
  linha += 2;
  for (const grupo of grupos) {
    escreverLinhaGrupo(sheet, linha, grupo.nome, totaisPorGrupo[grupo.nome], dias);
    linha += 1;
    for (const conta of grupo.contas) {
      escreverLinhaConta(sheet, linha, conta, dias);
      linha += 1;
    }
  }
  escreverLinhaGrupo(sheet, linha, 'TOTAL', totalGeral, dias, { total: true });
}

async function gerarRelatorioExcel(empresaId, filtrosQuery, meta) {
  const [{ contas }, opcoes, empresa] = await Promise.all([
    service.getSaldos(empresaId, filtrosQuery),
    service.getFiltros(empresaId),
    empresasService.getById(empresaId),
  ]);

  const dias = listarDias(filtrosQuery.dataInicio, filtrosQuery.dataFim);
  const meses = agruparMeses(dias);
  const grupos = agruparContas(contas);
  if (grupos.length === 0) throw erro(400, 'Nenhuma conta com saldo lançado nesta semana para exportar.');
  const { totaisPorGrupo, totalGeral } = calcularTotais(grupos, dias);

  // Mesmo universo de contas da classificação, só reagrupado — por isso reaproveita o mesmo
  // totalGeral (não recalcula) na linha TOTAL da seção "Saldos por Banco".
  const gruposBanco = agruparContasPorBanco(contas);
  const { totaisPorGrupo: totaisPorBanco } = calcularTotais(gruposBanco, dias);
  const bancoNomes = new Map(opcoes.bancos.map((b) => [b.codigo, b.nome]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Horizon Finanças';
  workbook.created = new Date();

  montarPlanilha(workbook, {
    empresaLabel: nomeExibicaoEmpresa(empresa),
    filtrosDisplay: montarFiltrosDisplay(filtrosQuery, opcoes),
    nomeUsuario: meta.nomeUsuario,
    geradoEm: meta.geradoEm,
    dias,
    meses,
    grupos,
    totaisPorGrupo,
    totalGeral,
    gruposBanco,
    totaisPorBanco,
    bancoNomes,
  });

  return workbook;
}

// Bug do exceljs 4.4.0 (lib/xlsx/xform/drawing/sp-pr.js): toda imagem inserida via addImage sai
// com <xdr:spPr><a:xfrm><a:ext cx="0" cy="0"/> fixo no XML, não importa o tamanho de verdade —
// é um template estático da lib, não depende de nada que a gente passa pro addImage. O tamanho
// real já está certo no <xdr:ext> logo antes (irmão do <xdr:pic>), e o Excel do computador é
// tolerante — ignora o spPr zerado e usa o xdr:ext. Mas outros leitores de OOXML (o preview de
// documento do WhatsApp, apps de Excel/Planilhas no celular) parecem confiar no spPr, e a
// logomarca do cabeçalho — a única imagem do relatório — some (tamanho zero). Corrige à mão
// reabrindo o .xlsx como zip e copiando o cx/cy de cada <xdr:ext> pro <a:ext> zerado logo depois
// dele, sem precisar mexer em mais nada.
async function corrigirTamanhoImagemNoBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const caminho = 'xl/drawings/drawing1.xml';
  const arquivo = zip.file(caminho);
  if (!arquivo) return buffer; // relatório sem imagem nenhuma (não devia acontecer, mas não é motivo pra falhar)

  const xmlOriginal = await arquivo.async('string');
  const xmlCorrigido = xmlOriginal.replace(
    /(<xdr:ext cx="(\d+)" cy="(\d+)"\/>[\s\S]*?)<a:ext cx="0" cy="0"\/>/g,
    (match, antes, cx, cy) => `${antes}<a:ext cx="${cx}" cy="${cy}"/>`
  );
  if (xmlCorrigido === xmlOriginal) return buffer; // nada pra corrigir (ex.: se a lib já consertar isso numa versão futura)

  zip.file(caminho, xmlCorrigido);
  return zip.generateAsync({ type: 'nodebuffer' });
}

// Mesma coisa que gerarRelatorioExcel, mas já devolve os bytes prontos (Buffer) em vez do
// Workbook do exceljs — usado por quem precisa do arquivo de verdade (streamar na resposta HTTP,
// anexar num WhatsApp) já com a correção do tamanho da logomarca aplicada.
async function gerarRelatorioExcelBuffer(empresaId, filtrosQuery, meta) {
  const workbook = await gerarRelatorioExcel(empresaId, filtrosQuery, meta);
  const buffer = await workbook.xlsx.writeBuffer();
  return corrigirTamanhoImagemNoBuffer(buffer);
}

// agruparContas/calcularTotais também usados por comunicarSaldos.service.js pra montar o
// resumo por classificação do dia encerrado (mesma lógica, só com `dias` de 1 elemento só).
module.exports = { gerarRelatorioExcel, gerarRelatorioExcelBuffer, agruparContas, calcularTotais };
