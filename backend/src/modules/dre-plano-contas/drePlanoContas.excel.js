const ExcelJS = require('exceljs');
const pool = require('../../config/db');
const { CORES, borda, preencher, cabecalho, impressao, corrigirArquivo } = require('../../utils/excelMarca');
const service = require('./drePlanoContas.service');

// Exportar Excel da aba Plano de Contas da DRE (um plano aberto): espelho da tabela da tela
// (PlanoDeContasTab.jsx) — a árvore inteira, aberta, com Código, Conta, Máscara DRE e Status. As
// totalizadoras em cinza e negrito, recuo por nível e o drilldown pelo contorno do Excel (botões à
// esquerda); Máscara DRE vazia em âmbar e preenchida em azul claro, como a combobox. Busca e filtros
// de coluna da tela não entram: sai o plano todo, com autofiltro no cabeçalho.

const NAO_ENTRA = 'NÃO ENTRA NA DRE';
const VERDE = 'FF059669';
const AMBAR = 'FFFCD34D';
const LINHA_CABECALHO = 6;

const COLUNAS = [
  { titulo: 'Código', largura: 16 },
  { titulo: 'Conta', largura: 64 },
  { titulo: 'Máscara DRE', largura: 40 },
  { titulo: 'Status', largura: 11 },
];

const dataHora = (v) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(v));

// Mesma lógica de PlanoDeContasTab.jsx::formatarCodigoMascara (máscara do plano financeiro).
function codigoFormatado(conta) {
  const larguras = [1, 2, 3, 4, 5, 6, 7].map((n) => conta[`mascara_nivel_${n}`]);
  const digitos = String(conta.sienge_id);
  const segmentos = [];
  let pos = 0;
  for (const largura of larguras) {
    if (pos >= digitos.length) break;
    if (!largura) {
      segmentos[segmentos.length - 1] += digitos.slice(pos);
      pos = digitos.length;
      break;
    }
    segmentos.push(digitos.slice(pos, pos + largura));
    pos += largura;
  }
  if (pos < digitos.length && segmentos.length > 0) segmentos[segmentos.length - 1] += digitos.slice(pos);
  return segmentos.length > 0 ? segmentos.join('.') : digitos;
}

// Linhas na ordem da tela, com o nível de cada uma — mesma árvore de PlanoDeContasTab.jsx::montarArvore
// (a mãe é a totalizadora mais próxima cujo código é prefixo do dela): em ordem de código, a pilha
// de totalizadoras abertas dá a profundidade.
function linhasDaArvore(contas) {
  const ordenadas = [...contas].sort((a, b) => String(a.sienge_id).localeCompare(String(b.sienge_id)));
  const pilha = [];
  return ordenadas.map((conta) => {
    const codigo = String(conta.sienge_id);
    while (pilha.length && !codigo.startsWith(String(pilha[pilha.length - 1]))) pilha.pop();
    const nivel = pilha.length;
    if (conta.tp_conta === 'T') pilha.push(conta.sienge_id);
    return { conta, nivel };
  });
}

// `centroId` null = plano Global. Devolve { buffer, nome }.
async function gerar(empresaId, centroId, usuarioId) {
  const classificacoes = await service.list(empresaId, centroId); // 404 se o centro não tem versão
  const [{ rows: contas }, { rows: mascaras }, { rows: empresas }, { rows: centros }, { rows: usuarios }] = await Promise.all([
    pool.query(
      `SELECT sienge_id, name, tp_conta, fl_ativa, mascara_nivel_1, mascara_nivel_2, mascara_nivel_3, mascara_nivel_4,
              mascara_nivel_5, mascara_nivel_6, mascara_nivel_7
         FROM planos_financeiros_sienge WHERE empresa_id = $1`,
      [empresaId]
    ),
    pool.query('SELECT id, descricao FROM dre_mascaras WHERE empresa_id = $1', [empresaId]),
    pool.query('SELECT nome_fantasia, razao_social FROM empresas WHERE id = $1', [empresaId]),
    centroId
      ? pool.query('SELECT name FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2', [empresaId, centroId])
      : { rows: [] },
    pool.query('SELECT nome FROM usuarios WHERE id = $1', [usuarioId]),
  ]);
  const empresa = empresas[0]?.nome_fantasia?.trim() || empresas[0]?.razao_social || `Empresa ${empresaId}`;
  const plano = centroId ? centros[0]?.name || `Centro ${centroId}` : 'Global';
  const nomeMascara = new Map(mascaras.map((m) => [m.id, m.descricao]));
  const mascaraDe = new Map(
    classificacoes.map((c) => [String(c.sienge_id), c.nao_entra ? NAO_ENTRA : nomeMascara.get(c.mascara_id) || ''])
  );
  const analiticas = contas.filter((c) => c.tp_conta !== 'T');
  const classificadas = analiticas.filter((c) => mascaraDe.get(String(c.sienge_id))).length;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Horizon Finanças';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Plano de Contas DRE', {
    views: [{ state: 'frozen', ySplit: LINHA_CABECALHO, showGridLines: false }],
    properties: { outlineProperties: { summaryBelow: false, summaryRight: false } },
  });
  COLUNAS.forEach((c, i) => (sheet.getColumn(i + 1).width = c.largura));
  cabecalho(workbook, sheet, {
    titulo: 'Plano de Contas DRE',
    subtitulo: centroId ? 'Vale só para este centro de custo' : 'Vale para todos os centros sem plano próprio',
    filtros: [
      ['Empresa', empresa],
      ['Plano', plano],
      ['Contas analíticas com máscara', `${classificadas} de ${analiticas.length}`],
    ],
    gerado: `Gerado por ${usuarios[0]?.nome || 'usuário'} em ${dataHora(new Date())}`,
    ultimaColuna: COLUNAS.length,
  });

  // Cabeçalho da tabela como o da tela: azul claro, texto azul, linha azul embaixo.
  COLUNAS.forEach((c, i) => {
    const cel = sheet.getCell(LINHA_CABECALHO, i + 1);
    cel.value = c.titulo.toUpperCase();
    cel.font = { bold: true, size: 9, color: { argb: CORES.AZUL } };
    cel.fill = preencher(CORES.AZUL_MUITO_CLARO);
    cel.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cel.border = { bottom: borda(CORES.AZUL, 'medium') };
  });
  sheet.getRow(LINHA_CABECALHO).height = 22;

  const linhas = linhasDaArvore(contas);
  let maiorNivel = 0;
  linhas.forEach(({ conta, nivel }, i) => {
    const totalizadora = conta.tp_conta === 'T';
    const mascara = totalizadora ? '' : mascaraDe.get(String(conta.sienge_id)) || '';
    const row = sheet.getRow(LINHA_CABECALHO + 1 + i);
    // Código só com dígitos (plano sem máscara de níveis) vai como número: como texto o Excel marca
    // "número armazenado como texto" em toda linha.
    const codigo = codigoFormatado(conta);
    row.values = [/^\d+$/.test(codigo) ? Number(codigo) : codigo, conta.name, mascara, conta.fl_ativa === 'S' ? 'Ativa' : 'Inativa'];
    row.height = totalizadora ? 18 : 16;
    if (nivel) row.outlineLevel = Math.min(nivel, 7);
    maiorNivel = Math.max(maiorNivel, nivel);

    const fundo = totalizadora ? CORES.CINZA_CLARO : CORES.BRANCO;
    row.eachCell({ includeEmpty: true }, (cel, col) => {
      if (col > COLUNAS.length) return;
      cel.fill = preencher(fundo);
      cel.border = { bottom: borda(totalizadora ? CORES.CINZA_BORDA : CORES.CINZA_LINHA) };
      cel.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    });
    row.getCell(1).font = { size: 9, color: { argb: CORES.CINZA } };
    row.getCell(2).font = { size: 9, bold: totalizadora, color: { argb: totalizadora ? CORES.PRETO : CORES.CINZA_ESCURO } };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 + nivel * 2 };
    if (!totalizadora) {
      const m = row.getCell(3);
      m.font = { size: 9, color: { argb: CORES.CINZA_ESCURO } };
      m.fill = preencher(mascara ? CORES.AZUL_MUITO_CLARO : CORES.AMARELO_CLARO);
      m.border = { bottom: borda(mascara ? CORES.CINZA_LINHA : AMBAR) };
    }
    row.getCell(4).font = { size: 9, color: { argb: conta.fl_ativa === 'S' ? VERDE : CORES.CINZA } };
  });

  sheet.properties.outlineLevelRow = Math.min(maiorNivel, 7);
  sheet.autoFilter = { from: { row: LINHA_CABECALHO, column: 1 }, to: { row: LINHA_CABECALHO, column: COLUNAS.length } };
  impressao(sheet, `${LINHA_CABECALHO}:${LINHA_CABECALHO}`);

  const buffer = await corrigirArquivo(await workbook.xlsx.writeBuffer());
  return { buffer, nome: `Plano de Contas DRE - ${empresa} - ${plano}.xlsx` };
}

module.exports = { gerar };
