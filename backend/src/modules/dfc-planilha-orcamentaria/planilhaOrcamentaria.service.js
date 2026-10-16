const ExcelJS = require('exceljs');
const pool = require('../../config/db');
const informado = require('../dfc-orcamento-informado/orcamentoInformado.service');
const { classificador, mesDeHoje, mesesEntre, somarMeses } = require('../dfc-fluxo/fluxo.service');
const { CORES, FORMATOS, borda, preencher, dataExcel, dataHoraExcel, cabecalho, cabecalhoTabela, corrigirArquivo } = require('../../utils/excelMarca');

// Planilha Orçamentária do DFC Construtoras (pedido do usuário):
// - layout(): Excel com a base empilhada — uma linha por centro (Projeta DFC) × natureza de origem
//   HORIZON - INFORMADO no plano do centro × mês — e o valor da última versão salva do Orçamento.
//   Planilha travada: só a coluna Valor pode ser alterada. Meses: 24 a partir do mês atual, ou até o
//   último mês com valor HORIZON - INFORMADO na versão, se for depois (no máximo 60 meses).
// - importar(): lê esse Excel e grava os valores como HORIZON - INFORMADO (via = 'PLANILHA'), como se
//   tivessem sido digitados — entram na próxima "Salvar Versão". Primeiro a prévia (o que muda e os erros
//   por linha); com `aplicar`, grava. Célula vazia limpa o valor.

const ABA = 'Orçamento';
const ABA_META = '_horizon';
const SENHA_PROTECAO = 'HorizonFin';
const COLUNAS = [
  ['ID Centro', 9],
  ['Centro de custo', 30],
  ['ID Natureza', 11],
  ['Código', 13],
  ['Natureza', 38],
  ['Máscara nível 1', 28],
  ['Máscara nível 2', 30],
  ['Mês', 11],
  ['Valor (R$)', 16],
];
const COL = { centro: 1, natureza: 3, mes: 8, valor: 9 };
const LINHA_CAB = 6;
const MAX_LINHAS = 50000;
const MESES_MINIMO = 24;
const MESES_MAXIMO = 60;
const MESES_CAB = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (m) => `${MESES_CAB[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;
const dataHora = (d) =>
  new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const centavos = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 100));

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Combinações centro × natureza INFORMADO, ordenadas como na planilha.
async function combinacoes(empresaId) {
  const lista = await informado.contasInformadas(empresaId);
  if (!lista.length) throw erro(400, 'Nenhuma natureza com Origem Projeção "HORIZON - INFORMADO" nos centros com Projeta DFC (aba Plano Contas).');
  return lista;
}

async function ultimaVersao(empresaId) {
  const { rows } = await pool.query(
    `SELECT v.numero, v.criado_em, u.nome AS usuario FROM dfc_orcamento_versoes v LEFT JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.empresa_id = $1 ORDER BY v.numero DESC LIMIT 1`,
    [empresaId]
  );
  return rows[0] || null;
}

// ─── Layout ─────────────────────────────────────────────────────────────────────────────────────
async function layout(empresaId, usuarioId) {
  const [lista, cls, versao, { rows: valores }, { rows: [ultimoMes] }, { rows: emp }, { rows: usu }] = await Promise.all([
    combinacoes(empresaId),
    classificador(empresaId),
    ultimaVersao(empresaId),
    pool.query(
      `SELECT centro_id, sienge_id, to_char(mes, 'YYYY-MM') AS mes, valor FROM dfc_orcamento_valores
        WHERE empresa_id = $1 AND origem = $2`,
      [empresaId, informado.ORIGEM]
    ),
    pool.query(`SELECT to_char(max(mes), 'YYYY-MM') AS mes FROM dfc_orcamento_valores WHERE empresa_id = $1 AND origem = $2`, [
      empresaId,
      informado.ORIGEM,
    ]),
    pool.query(`SELECT COALESCE(NULLIF(nome_fantasia, ''), razao_social) AS nome FROM empresas WHERE id = $1`, [empresaId]),
    pool.query('SELECT nome FROM usuarios WHERE id = $1', [usuarioId]),
  ]);
  const inicio = mesDeHoje();
  const minimo = somarMeses(inicio, MESES_MINIMO - 1);
  const maximo = somarMeses(inicio, MESES_MAXIMO - 1);
  const ultimoInformado = ultimoMes?.mes && ultimoMes.mes > minimo ? ultimoMes.mes : minimo;
  const fim = ultimoInformado > maximo ? maximo : ultimoInformado;
  const meses = mesesEntre(inicio, fim);
  const valor = new Map(valores.map((v) => [`${v.centro_id}|${v.sienge_id}|${v.mes}`, Number(v.valor)]));
  const empresa = emp[0]?.nome || `Empresa ${empresaId}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Horizon Finanças';
  const sh = wb.addWorksheet(ABA, { views: [{ state: 'frozen', xSplit: 2, ySplit: LINHA_CAB, showGridLines: false }] });
  COLUNAS.forEach(([, w], i) => (sh.getColumn(i + 1).width = w));
  cabecalho(wb, sh, {
    titulo: 'Planilha Orçamentária — DFC Construtoras',
    subtitulo:
      'Altere só a coluna Valor (saída NEGATIVA, entrada positiva; vazio limpa o mês). Importe em Orçamentos › Nova versão › Planilha Orçamentária.',
    filtros: [
      ['Empresa', empresa],
      ['Meses', `${rotuloMes(inicio)} a ${rotuloMes(fim)}`],
      ['Valores', versao ? `versão ${versao.numero} do Orçamento, salva em ${dataHora(versao.criado_em)}${versao.usuario ? ` por ${versao.usuario}` : ''}` : 'nenhuma versão salva'],
      ['Origem', 'HORIZON - INFORMADO'],
    ],
    gerado: `Gerado por ${usu[0]?.nome || 'usuário'} em ${dataHora(new Date())}`,
    ultimaColuna: COLUNAS.length,
  });
  cabecalhoTabela(sh, LINHA_CAB, COLUNAS.map(([r]) => r));

  let linha = LINHA_CAB + 1;
  lista.forEach((c) => {
    const conta = cls.conta(c.sienge_id);
    const m = cls.classificar(c.centro_id, c.sienge_id);
    meses.forEach((mes) => {
      const r = sh.getRow(linha);
      const v = valor.get(`${c.centro_id}|${c.sienge_id}|${mes}`);
      r.values = [
        c.centro_id,
        c.centro,
        c.sienge_id,
        conta.codigo,
        conta.name || c.natureza,
        m ? cls.nomeMascara[m.n1] : '',
        m ? cls.nomeMascara[m.n2] : '',
        dataExcel(mes),
        v === undefined ? null : v,
      ];
      r.font = { size: 10, color: { argb: CORES.CINZA_ESCURO } };
      r.getCell(COL.mes).numFmt = FORMATOS.mes;
      const cv = r.getCell(COL.valor);
      cv.numFmt = FORMATOS.moeda;
      cv.protection = { locked: false };
      cv.fill = preencher(CORES.AMARELO_CLARO);
      cv.font = { size: 10, bold: true, color: { argb: CORES.PRETO } };
      cv.border = { left: borda(CORES.CINZA_BORDA), right: borda(CORES.CINZA_BORDA), bottom: borda(CORES.CINZA_LINHA) };
      cv.dataValidation = {
        type: 'decimal',
        operator: 'between',
        formulae: [-1e12, 1e12],
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: 'Valor inválido',
        error: 'Digite um número (saída negativa, entrada positiva) ou deixe vazio para limpar.',
      };
      if (linha % 2 === 0) for (let k = 1; k < COL.valor; k += 1) r.getCell(k).fill = preencher(CORES.SLATE);
      linha += 1;
    });
  });
  sh.autoFilter = { from: { row: LINHA_CAB, column: 1 }, to: { row: linha - 1, column: COLUNAS.length } };
  // Travada: só a coluna Valor (desbloqueada acima) pode ser alterada; filtro e largura de coluna liberados.
  await sh.protect(SENHA_PROTECAO, {
    selectLockedCells: true,
    selectUnlockedCells: true,
    autoFilter: true,
    sort: false,
    formatColumns: true,
    formatRows: false,
    insertRows: false,
    deleteRows: false,
  });

  // Instruções.
  const ins = wb.addWorksheet('Instruções', { views: [{ showGridLines: false }] });
  ins.getColumn(1).width = 4;
  ins.getColumn(2).width = 110;
  [
    ['Como usar a Planilha Orçamentária', true],
    ['1. Altere somente a coluna "Valor (R$)" (em amarelo). As demais colunas e as linhas estão travadas.'],
    ['2. Saídas (despesas) com sinal NEGATIVO; entradas com sinal positivo. Ex.: um gasto de 1.500 = -1500.'],
    ['3. Para limpar o valor de um mês, apague a célula (deixe vazia).'],
    ['4. Use o filtro do cabeçalho para achar centro, natureza ou mês. Não inclua nem apague linhas.'],
    ['5. No Horizon Fin: DFC Construtoras › Orçamentos › Nova versão › Planilha Orçamentária › Importar.'],
    ['   O sistema mostra uma prévia (o que muda e eventuais erros) antes de gravar.'],
    ['6. Os valores importados entram como HORIZON - INFORMADO e só valem no Orçamento depois de "Salvar versão".'],
    ['Só aparecem naturezas com Origem Projeção "HORIZON - INFORMADO" nos centros com "Projeta DFC". Para incluir outra, ajuste a aba Plano Contas e baixe o layout de novo.'],
  ].forEach(([t, titulo], i) => {
    const c = ins.getCell(i + 2, 2);
    c.value = t;
    c.font = titulo ? { bold: true, size: 14, color: { argb: CORES.AZUL_ESCURO } } : { size: 11, color: { argb: CORES.CINZA_ESCURO } };
    c.alignment = { wrapText: true, vertical: 'top' };
  });
  await ins.protect(SENHA_PROTECAO, { selectLockedCells: true, selectUnlockedCells: true });

  // Identificação (oculta): a importação confere a empresa.
  const meta = wb.addWorksheet(ABA_META, { state: 'veryHidden' });
  meta.getCell('A1').value = 'empresa_id';
  meta.getCell('B1').value = Number(empresaId);
  meta.getCell('A2').value = 'gerado_em';
  meta.getCell('B2').value = dataHoraExcel(new Date());
  meta.getCell('A3').value = 'versao';
  meta.getCell('B3').value = versao?.numero ?? null;
  await meta.protect(SENHA_PROTECAO, {});

  const buffer = await corrigirArquivo(await wb.xlsx.writeBuffer());
  const nomeArquivo = `Planilha Orçamentária - ${empresa} - ${rotuloMes(inicio).replace('/', '-')} a ${rotuloMes(fim).replace('/', '-')}.xlsx`;
  return { buffer, nome: nomeArquivo, linhas: linha - LINHA_CAB - 1 };
}

// ─── Importação ─────────────────────────────────────────────────────────────────────────────────
// Célula -> 'AAAA-MM' (data do Excel, texto "AAAA-MM", "mm/aaaa" ou "mmm/aaaa").
function mesDaCelula(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}`;
  if (typeof v === 'object' && v.result !== undefined) return mesDaCelula(v.result);
  const t = String(v).trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = /^([a-zç]{3})\/(\d{2,4})$/.exec(t);
  if (m && MESES_CAB.includes(m[1])) return `${m[2].length === 2 ? `20${m[2]}` : m[2]}-${String(MESES_CAB.indexOf(m[1]) + 1).padStart(2, '0')}`;
  return undefined;
}
// Célula -> número | null (vazio) | undefined (inválido).
function valorDaCelula(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined;
  if (typeof v === 'object' && v.result !== undefined) return valorDaCelula(v.result);
  const t = String(v).trim().replace(/\s|R\$/g, '');
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) && Math.abs(n) < 1e12 ? Math.round(n * 100) / 100 : undefined;
}
const inteiro = (v) => {
  const n = Number(typeof v === 'object' && v?.result !== undefined ? v.result : v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

async function importar(empresaId, { buffer, arquivo }, usuarioId, { aplicar = false } = {}) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw erro(400, 'Não foi possível ler o arquivo. Envie o .xlsx baixado em "Layout do orçamento".');
  }
  const sh = wb.getWorksheet(ABA);
  if (!sh) throw erro(400, `A planilha precisa ter a aba "${ABA}" do layout do orçamento. Baixe o layout de novo e preencha nele.`);
  const meta = wb.getWorksheet(ABA_META);
  const empresaArquivo = meta ? inteiro(meta.getCell('B1').value) : null;
  if (empresaArquivo && empresaArquivo !== Number(empresaId)) {
    throw erro(400, 'Esta planilha foi gerada para outra empresa. Baixe o layout da empresa selecionada.');
  }
  // Cabeçalho: confere as colunas-chave.
  const cab = (k) => String(sh.getRow(LINHA_CAB).getCell(k).value || '').trim();
  if (cab(COL.centro) !== COLUNAS[0][0] || cab(COL.natureza) !== COLUNAS[2][0] || cab(COL.mes) !== COLUNAS[7][0] || !cab(COL.valor).startsWith('Valor')) {
    throw erro(400, 'O cabeçalho da planilha não é o do layout do orçamento (colunas ID Centro, ID Natureza, Mês e Valor). Baixe o layout de novo.');
  }

  const permitidas = new Set((await combinacoes(empresaId)).map((c) => `${c.centro_id}|${c.sienge_id}`));
  const erros = [];
  const itens = [];
  const vistos = new Map();
  const ultima = Math.min(sh.rowCount, LINHA_CAB + MAX_LINHAS);
  for (let n = LINHA_CAB + 1; n <= ultima; n += 1) {
    const r = sh.getRow(n);
    const c = r.getCell(COL.centro).value;
    const nat = r.getCell(COL.natureza).value;
    const mesV = r.getCell(COL.mes).value;
    const valV = r.getCell(COL.valor).value;
    if ([c, nat, mesV, valV].every((x) => x === null || x === undefined || x === '')) continue;
    const centroId = inteiro(c);
    const siengeId = inteiro(nat);
    const mes = mesDaCelula(mesV);
    const valor = valorDaCelula(valV);
    const falha = (msg) => erros.length < 200 && erros.push({ linha: n, erro: msg });
    if (!centroId || !siengeId) {
      falha('ID Centro ou ID Natureza vazio ou inválido.');
      continue;
    }
    if (!mes) {
      falha('Mês inválido (use o mês do layout).');
      continue;
    }
    if (valor === undefined) {
      falha(`Valor "${typeof valV === 'object' ? JSON.stringify(valV) : valV}" não é um número.`);
      continue;
    }
    if (!permitidas.has(`${centroId}|${siengeId}`)) {
      falha(`Centro ${centroId} × natureza ${siengeId} não é HORIZON - INFORMADO (ou o centro não tem Projeta DFC).`);
      continue;
    }
    const chave = `${centroId}|${siengeId}|${mes}`;
    if (vistos.has(chave)) {
      falha(`Repetida (mesmo centro, natureza e mês da linha ${vistos.get(chave)}).`);
      continue;
    }
    vistos.set(chave, n);
    itens.push({ centro_id: centroId, sienge_id: siengeId, mes, valor: valor === 0 ? null : valor });
  }
  if (sh.rowCount > LINHA_CAB + MAX_LINHAS) erros.push({ linha: null, erro: `Mais de ${MAX_LINHAS} linhas: só as primeiras foram lidas.` });
  if (!itens.length && !erros.length) throw erro(400, 'A planilha não tem linhas de orçamento.');

  // Diferença para o que está digitado hoje (HORIZON - INFORMADO, ainda não salvo ou já salvo).
  const { rows: atuais } = await pool.query(
    `SELECT centro_id, sienge_id, to_char(mes, 'YYYY-MM') AS mes, valor FROM dfc_orcamento_informado WHERE empresa_id = $1`,
    [empresaId]
  );
  const atual = new Map(atuais.map((a) => [`${a.centro_id}|${a.sienge_id}|${a.mes}`, a.valor === null ? null : Number(a.valor)]));
  const mudancas = itens
    .map((it) => ({ ...it, anterior: atual.get(`${it.centro_id}|${it.sienge_id}|${it.mes}`) ?? null }))
    .filter((it) => centavos(it.anterior) !== centavos(it.valor));
  const resumo = {
    linhas: itens.length,
    sem_mudanca: itens.length - mudancas.length,
    incluidos: mudancas.filter((m) => m.anterior === null && m.valor !== null).length,
    alterados: mudancas.filter((m) => m.anterior !== null && m.valor !== null).length,
    limpos: mudancas.filter((m) => m.valor === null).length,
  };

  // Nomes para a prévia.
  const nomes = async () => {
    const ids = (k) => [...new Set(mudancas.map((m) => m[k]))];
    const [cs, ns] = await Promise.all([
      pool.query('SELECT sienge_id, name FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = ANY($2::int[])', [empresaId, ids('centro_id')]),
      pool.query('SELECT sienge_id, name FROM planos_financeiros_sienge WHERE empresa_id = $1 AND sienge_id = ANY($2::int[])', [empresaId, ids('sienge_id')]),
    ]);
    const c = new Map(cs.rows.map((r) => [r.sienge_id, r.name]));
    const n = new Map(ns.rows.map((r) => [r.sienge_id, r.name]));
    return mudancas.slice(0, 300).map((m) => ({ ...m, centro: c.get(m.centro_id) || `Centro ${m.centro_id}`, natureza: n.get(m.sienge_id) || `Natureza ${m.sienge_id}` }));
  };

  if (!aplicar || erros.length) {
    return { aplicado: false, resumo, erros, mudancas: await nomes() };
  }
  if (!mudancas.length) return { aplicado: false, resumo, erros, mudancas: [], aviso: 'Nada mudou em relação ao que já está no Orçamento.' };

  await informado.gravarVarios(
    empresaId,
    mudancas.map(({ centro_id, sienge_id, mes, valor }) => ({ centro_id, sienge_id, mes, valor })),
    usuarioId,
    'PLANILHA'
  );
  await pool.query(
    `INSERT INTO dfc_orcamento_importacoes (empresa_id, usuario_id, arquivo, linhas, incluidos, alterados, limpos, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [empresaId, usuarioId, String(arquivo || '').slice(0, 255), resumo.linhas, resumo.incluidos, resumo.alterados, resumo.limpos, new Date()]
  );
  return { aplicado: true, resumo, erros: [] };
}

// Situação da base na janela Nova versão: a última importação.
async function situacao(empresaId) {
  const { rows } = await pool.query(
    `SELECT i.criado_em, i.arquivo, i.linhas, i.incluidos, i.alterados, i.limpos, u.nome AS usuario
       FROM dfc_orcamento_importacoes i LEFT JOIN usuarios u ON u.id = i.usuario_id
      WHERE i.empresa_id = $1 ORDER BY i.criado_em DESC LIMIT 1`,
    [empresaId]
  );
  return { ultima: rows[0] || null };
}

module.exports = { layout, importar, situacao, SENHA_PROTECAO };
