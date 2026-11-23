const ExcelJS = require('exceljs');
const pool = require('../../config/db');
const { CORES, FORMATOS, borda, preencher, cabecalho, impressao, corrigirArquivo } = require('../../utils/excelMarca');
const agrupadores = require('../dre-agrupadores/agrupadores.service');

// Exportar Excel da aba Centros Custos da DRE (pedido do usuário, 23/11/2026): a base inteira dos centros de
// custo da empresa — todas as situações, sem a busca/filtro da tela —, na ordem da aba: os agrupadores primeiro
// (uma linha do agrupador, em cinza e negrito, e os centros dele embaixo, com drilldown pelo contorno do Excel) e
// depois os centros fora de agrupador. Com as colunas da aba (Tipo, Realiza DRE) e o cadastro do centro. Lê pelo
// contexto da versão da DRE do pedido (a aberta, ou a visualizada).

const LINHA_CABECALHO = 6;
const VERDE = 'FF059669';

const sn = (v) => (v ? 'Sim' : 'Não');
const TIPO = { OBRA: 'Obra', ADMINISTRATIVO: 'Administrativo' };
const dataHora = (v) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(v));

// `valor(c)` = o valor da linha de um centro; `grupo(g)` = o da linha do agrupador (ausente = vazio).
const COLUNAS = [
  { titulo: 'Agrupador', largura: 30, valor: (c) => c.agrupador || '', grupo: (g) => g.nome },
  { titulo: 'Principal', largura: 10, centro: true, valor: (c) => (c.agrupador ? (c.principal ? 'Sim' : 'Não') : '') },
  { titulo: 'Código', largura: 10, valor: (c) => c.sienge_id },
  { titulo: 'Centro de custo', largura: 46, valor: (c) => c.name, grupo: (g) => `${g.centros.length} ${g.centros.length === 1 ? 'centro' : 'centros'}` },
  { titulo: 'Apelido', largura: 22, valor: (c) => c.apelido || '' },
  { titulo: 'Situação', largura: 11, valor: (c) => (c.status === 'ATIVO' ? 'Ativo' : c.status ? 'Inativo' : '') },
  { titulo: 'Tipo', largura: 15, valor: (c) => TIPO[c.natureza] || '', grupo: (g) => TIPO[g.natureza] || '' },
  { titulo: 'Realiza DRE', largura: 12, centro: true, valor: (c) => sn(c.realiza_dre), grupo: (g) => sn(g.realiza_dre) },
  { titulo: 'Projeta DFC', largura: 12, centro: true, valor: (c) => sn(c.projeta_dfc) },
  { titulo: 'Empresa (Sienge)', largura: 36, valor: (c) => c.company_name || '' },
  { titulo: 'CNPJ', largura: 20, valor: (c) => c.cnpj || '' },
  { titulo: 'Nome comercial', largura: 30, valor: (c) => c.commercial_name || '' },
  { titulo: 'Tipo de obra', largura: 22, valor: (c) => c.building_type_description || '' },
  { titulo: 'Base de custo', largura: 22, valor: (c) => c.cost_database_description || '' },
  { titulo: 'Endereço', largura: 40, valor: (c) => c.endereco || '' },
  { titulo: 'Cidade', largura: 20, valor: (c) => c.cidade_enriquecida || '' },
  { titulo: 'UF', largura: 6, centro: true, valor: (c) => c.estado_enriquecido || '' },
  { titulo: 'CEP', largura: 11, valor: (c) => c.cep || '' },
  { titulo: 'Nº de unidades', largura: 12, numero: FORMATOS.int, valor: (c) => (c.numero_unidades === null ? '' : Number(c.numero_unidades)) },
  { titulo: 'VGV', largura: 18, numero: FORMATOS.moeda, valor: (c) => (c.valor_geral_vendas === null ? '' : Number(c.valor_geral_vendas)) },
  { titulo: 'Responsável', largura: 26, valor: (c) => c.responsavel || '' },
  { titulo: 'Código Prevision', largura: 16, valor: (c) => c.codigo_prevision || '' },
  { titulo: 'Contrato Caixa', largura: 16, valor: (c) => c.codigo_contrato_caixa || '' },
];

async function gerar(empresaId, usuarioId) {
  const [{ rows: centros }, grupos, { rows: empresas }, { rows: usuarios }] = await Promise.all([
    pool.query(
      `SELECT c.sienge_id, c.name, c.apelido, c.status, c.natureza, c.realiza_dre, c.projeta_dfc, c.company_name, c.cnpj,
              c.commercial_name, c.building_type_description, c.cost_database_description, c.endereco, c.cidade_enriquecida,
              c.estado_enriquecido, c.cep, c.numero_unidades, c.valor_geral_vendas, c.codigo_prevision, c.codigo_contrato_caixa,
              u.nome AS responsavel, ac.agrupador_id, COALESCE(ac.principal, FALSE) AS principal
         FROM centros_custo_sienge c
         LEFT JOIN dre_agrupadores_centros ac ON ac.empresa_id = c.empresa_id AND ac.centro_id = c.sienge_id
         LEFT JOIN usuarios u ON u.id = c.responsavel_id
        WHERE c.empresa_id = $1
        ORDER BY c.dre_ordem ASC NULLS LAST, c.sienge_id ASC`,
      [empresaId]
    ),
    agrupadores.listarAgrupadores(empresaId),
    pool.query('SELECT nome_fantasia, razao_social FROM empresas WHERE id = $1', [empresaId]),
    pool.query('SELECT nome FROM usuarios WHERE id = $1', [usuarioId]),
  ]);
  const empresa = empresas[0]?.nome_fantasia?.trim() || empresas[0]?.razao_social || `Empresa ${empresaId}`;
  const porId = new Map(grupos.map((g) => [g.id, g]));
  centros.forEach((c) => {
    c.agrupador = c.agrupador_id ? porId.get(c.agrupador_id)?.nome || '' : '';
  });

  // Ordem da aba: agrupadores (vazios primeiro, os outros na ordem do primeiro centro), depois os soltos.
  const linhas = [];
  const vazios = grupos.filter((g) => !g.centros.length);
  const vistos = new Set();
  const comCentros = [];
  centros.forEach((c) => {
    if (c.agrupador_id && !vistos.has(c.agrupador_id)) {
      vistos.add(c.agrupador_id);
      comCentros.push(porId.get(c.agrupador_id));
    }
  });
  [...vazios, ...comCentros].filter(Boolean).forEach((g) => {
    const membros = centros.filter((c) => c.agrupador_id === g.id);
    const natureza = membros.some((m) => m.natureza === 'OBRA') ? 'OBRA' : membros.some((m) => m.natureza === 'ADMINISTRATIVO') ? 'ADMINISTRATIVO' : null;
    linhas.push({ grupo: { ...g, natureza } });
    membros.forEach((c) => linhas.push({ centro: c, nivel: 1 }));
  });
  const soltos = centros.filter((c) => !c.agrupador_id);
  soltos.forEach((c) => linhas.push({ centro: c, nivel: 0 }));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Horizon Finanças';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Centros de Custo DRE', {
    views: [{ state: 'frozen', ySplit: LINHA_CABECALHO, xSplit: 4, showGridLines: false }],
    properties: { outlineProperties: { summaryBelow: false, summaryRight: false } },
  });
  COLUNAS.forEach((c, i) => (sheet.getColumn(i + 1).width = c.largura));
  const versao = pool.contextoAtual()?.versao;
  cabecalho(workbook, sheet, {
    titulo: 'Centros de Custo — DRE',
    subtitulo: 'Agrupadores e centros de custo, na ordem da aba Centros Custos (agrupadores primeiro)',
    filtros: [
      ['Empresa', empresa],
      ...(versao ? [['Versão da DRE', `${versao.numero}${versao.status === 'ABERTA' ? ' (em edição)' : ''}`]] : []),
      ['Agrupadores', grupos.length],
      ['Centros', `${centros.length} (${centros.filter((c) => c.status === 'ATIVO').length} ativos)`],
      ['Com Realiza DRE', centros.filter((c) => c.realiza_dre).length],
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
    cel.alignment = { vertical: 'middle', horizontal: c.centro ? 'center' : 'left', indent: c.centro ? 0 : 1, wrapText: true };
    cel.border = { bottom: borda(CORES.AZUL, 'medium') };
  });
  sheet.getRow(LINHA_CABECALHO).height = 24;

  linhas.forEach((l, i) => {
    const row = sheet.getRow(LINHA_CABECALHO + 1 + i);
    const ehGrupo = Boolean(l.grupo);
    row.values = COLUNAS.map((c) => (ehGrupo ? (c.grupo ? c.grupo(l.grupo) : '') : c.valor(l.centro)));
    row.height = ehGrupo ? 18 : 16;
    if (l.nivel) row.outlineLevel = 1;
    COLUNAS.forEach((c, j) => {
      const cel = row.getCell(j + 1);
      cel.fill = preencher(ehGrupo ? CORES.CINZA_CLARO : CORES.BRANCO);
      cel.border = { bottom: borda(ehGrupo ? CORES.CINZA_BORDA : CORES.CINZA_LINHA) };
      cel.alignment = { vertical: 'middle', horizontal: c.centro ? 'center' : c.numero ? 'right' : 'left', indent: c.centro || c.numero ? 0 : 1 };
      cel.font = { size: 9, bold: ehGrupo, color: { argb: ehGrupo ? CORES.PRETO : CORES.CINZA_ESCURO } };
      if (c.numero && !ehGrupo) cel.numFmt = c.numero;
    });
    if (!ehGrupo) {
      const c = l.centro;
      // Centro dentro de agrupador: recuado; o nome do agrupador em cinza.
      if (l.nivel) {
        row.getCell(1).font = { size: 9, color: { argb: CORES.CINZA } };
        row.getCell(4).alignment = { vertical: 'middle', horizontal: 'left', indent: 3 };
      }
      row.getCell(6).font = { size: 9, color: { argb: c.status === 'ATIVO' ? VERDE : CORES.CINZA } };
      row.getCell(8).font = { size: 9, bold: Boolean(c.realiza_dre), color: { argb: c.realiza_dre ? VERDE : CORES.CINZA } };
    }
  });

  sheet.properties.outlineLevelRow = 1;
  sheet.autoFilter = { from: { row: LINHA_CABECALHO, column: 1 }, to: { row: LINHA_CABECALHO, column: COLUNAS.length } };
  impressao(sheet, `${LINHA_CABECALHO}:${LINHA_CABECALHO}`);

  const buffer = await corrigirArquivo(await workbook.xlsx.writeBuffer());
  return { buffer, nome: `Centros de Custo DRE - ${empresa}.xlsx` };
}

module.exports = { gerar };
