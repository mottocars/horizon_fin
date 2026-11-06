const ExcelJS = require('exceljs');
const pool = require('../../config/db');
const dreMascaras = require('../dre-mascaras/dreMascaras.service');
const planoContas = require('../dre-plano-contas/drePlanoContas.service');
const unidadesService = require('../dre-unidades/unidades.service');
const { mesDaCelula, valorDaCelula, inteiro } = require('../dfc-planilha-orcamentaria/planilhaOrcamentaria.service');
const { CORES, FORMATOS, borda, preencher, dataExcel, dataHoraExcel, cabecalho, cabecalhoTabela, corrigirArquivo } = require('../../utils/excelMarca');
const calculo = require('./calculo');
const service = require('./dreProjecoes.service');

// Planilha da Projeção da DRE (aba Projeções da DRE Construtoras) — mesmo esquema da Planilha
// Orçamentária da DFC (dfc-planilha-orcamentaria): um Excel travado (só as células amarelas mudam),
// preenchido com o rascunho de cada centro ou, sem rascunho, com o orçamento da última versão; a
// importação mostra a prévia e grava nos rascunhos (criando os que faltam), como se tivesse sido
// digitado no assistente. Três abas:
//   Ciclos  — um centro (Realiza DRE, com Tipo) por linha: início e fim do ciclo e "realizado até" (a
//             trava). Centro com ciclo em branco não é importado.
//   Vendas  — as unidades disponíveis na trava de cada obra: valor (vazio = ticket médio do tipo) e mês.
//   Custos da POC / Demais contas — centro × natureza HORIZON - INFORMADO das máscaras de cada etapa do
//             assistente × mês (e a Correção Monetária, ID Natureza "CM"), dos meses projetados (mês
//             seguinte à trava até o fim do ciclo). Centro sem orçamento: 24 meses a partir do mês atual.
// A planilha de uma etapa do assistente (recorte) tem só a aba daquela etapa, só do centro do rascunho.

// Os valores ficam em duas abas, como as etapas do assistente: Custos da POC (só obras) e Demais contas.
const ABA = { ciclos: 'Ciclos', vendas: 'Vendas', poc: 'Custos da POC', demais: 'Demais contas', meta: '_horizon' };
const TITULO_ETAPA = { poc: 'Custos da POC', demais: 'Demais contas' };
const SENHA = 'HorizonFin';
const CORRECAO = 'CM';
const LINHA_CAB = 6;
const MAX_LINHAS = 80000;
const MESES_PADRAO = 24;
const MESES_CAB = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (m) => (m ? `${MESES_CAB[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}` : '');
const dataHora = (d) =>
  new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const centavos = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 100));
const { somarMeses, mesesEntre, ORIGEM } = calculo;

const COLUNAS = {
  ciclos: [
    ['ID Centro', 10],
    ['Centro de custo', 34],
    ['Tipo', 16],
    ['Orçamento atual', 26],
    ['Início do ciclo', 15],
    ['Fim do ciclo', 15],
    ['Realizado até', 15],
  ],
  vendas: [
    ['ID Centro', 10],
    ['Centro de custo', 28],
    ['Chave', 10],
    ['Unidade', 14],
    ['Tipo', 18],
    ['Fração ideal', 13],
    ['Ticket médio', 16],
    ['Valor de venda', 17],
    ['Mês de venda', 14],
  ],
  valores: [
    ['ID Centro', 10],
    ['Centro de custo', 28],
    ['ID Natureza', 12],
    ['Natureza', 40],
    ['Máscara nível 1', 30],
    ['Máscara nível 2', 32],
    ['Mês', 11],
    ['Valor (R$)', 16],
  ],
};

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

async function estrutura(empresaId) {
  const [{ rows: mascaras }, { rows: cfg }, arvore] = await Promise.all([
    pool.query(
      `SELECT m.id, m.parent_id, m.descricao, m.realiza_poc, m.tipo_poc, m.origem, m.calculo
         FROM dre_mascaras m JOIN dre_mascaras p ON p.id = m.parent_id
        WHERE m.empresa_id = $1 ORDER BY p.ordem, m.ordem`,
      [empresaId]
    ),
    pool.query(
      `SELECT c.poc_receita_mascara_id AS id, m.descricao FROM dre_configuracoes c
         LEFT JOIN dre_mascaras m ON m.id = c.poc_receita_mascara_id WHERE c.empresa_id = $1`,
      [empresaId]
    ),
    dreMascaras.list(empresaId),
  ]);
  return { mascaras, cfg, pais: new Map(arvore.map((g) => [g.id, g.descricao])) };
}

// Centros que entram na planilha (Realiza DRE e com Tipo), na ordem da DRE, com o orçamento atual de
// cada um: o rascunho, senão o da última versão.
async function centrosComOrcamento(empresaId) {
  const [{ rows: centros }, { rows: orcs }] = await Promise.all([
    pool.query(
      `SELECT sienge_id::int AS id, COALESCE(NULLIF(TRIM(apelido), ''), name) AS nome, natureza
         FROM centros_custo_sienge
        WHERE empresa_id = $1 AND realiza_dre AND natureza IS NOT NULL
        ORDER BY dre_ordem ASC NULLS LAST, sienge_id ASC`,
      [empresaId]
    ),
    pool.query(
      `SELECT o.id, o.centro_id, o.versao_id, o.status, v.numero, to_char(o.ciclo_inicio, 'YYYY-MM') AS ciclo_inicio,
              to_char(o.ciclo_fim, 'YYYY-MM') AS ciclo_fim, to_char(o.trava, 'YYYY-MM') AS trava, o.dados
         FROM dre_projecao_orcamentos o
         LEFT JOIN dre_projecao_versoes v ON v.id = o.versao_id
        WHERE o.empresa_id = $1
          AND (o.versao_id IS NULL
               OR o.versao_id = (SELECT id FROM dre_projecao_versoes WHERE empresa_id = $1 ORDER BY numero DESC LIMIT 1))`,
      [empresaId]
    ),
  ]);
  return centros.map((c) => {
    const rascunho = orcs.find((o) => o.centro_id === c.id && o.versao_id === null);
    const versao = orcs.find((o) => o.centro_id === c.id && o.versao_id !== null);
    return { ...c, rascunho: rascunho || null, versao: versao || null, orc: rascunho || versao || null };
  });
}

// Trava que vale pra um centro quando a planilha não informa: a do orçamento; sem ela, o mês anterior
// ao atual se o centro já tem lançamento até lá, senão o mês antes do início do ciclo.
async function travaPadrao(empresaId, centroId, orc, cicloInicio) {
  if (orc?.trava) return orc.trava;
  const sugerida = somarMeses(calculo.mesAtual(), -1);
  const primeiro = await calculo.primeiroMes(empresaId, centroId);
  return primeiro && primeiro <= sugerida ? sugerida : somarMeses(cicloInicio, -1);
}

// O que cada centro projeta: as naturezas HORIZON - INFORMADO das máscaras projetadas (obra: as das
// etapas POC e Demais; administrativo: só as Demais) e se tem a linha de Correção Monetária. `etapa`
// ('poc' | 'demais'): só as máscaras daquela etapa do assistente.
function digitaveis(centro, plano, { mascaras, cfg, pais }, etapa = null) {
  const p = calculo.papeis(mascaras, cfg);
  const obra = centro.natureza === 'OBRA';
  const daEtapa = (m) => {
    const e = p.etapaDe(m);
    return e && (obra || e === 'demais') && (!etapa || e === etapa);
  };
  const alvo = new Map(mascaras.filter((m) => daEtapa(m) && m.calculo !== 'CORRECAO_MONETARIA').map((m) => [m.id, m]));
  const correcao = mascaras.find((m) => m.calculo === 'CORRECAO_MONETARIA' && daEtapa(m)) || null;
  const naturezas = plano.contas
    .filter((c) => !c.nao_entra && alvo.has(c.mascara_id) && c.origem_projecao === ORIGEM.INFORMADO)
    .map((c) => {
      const m = alvo.get(c.mascara_id);
      return { id: c.natureza_id, nome: c.nome, n1: pais.get(m.parent_id) || '', n2: m.descricao };
    });
  return {
    naturezas,
    correcao: correcao ? { id: CORRECAO, nome: 'CORREÇÃO MONETÁRIA (a realizar no mês)', n1: pais.get(correcao.parent_id) || '', n2: correcao.descricao } : null,
  };
}

function travarCelula(cv, { tipo = 'decimal', mensagem } = {}) {
  cv.protection = { locked: false };
  cv.fill = preencher(CORES.AMARELO_CLARO);
  cv.font = { size: 10, bold: true, color: { argb: CORES.PRETO } };
  cv.border = { left: borda(CORES.CINZA_BORDA), right: borda(CORES.CINZA_BORDA), bottom: borda(CORES.CINZA_LINHA) };
  if (tipo === 'decimal') {
    cv.dataValidation = {
      type: 'decimal',
      operator: 'between',
      formulae: [-1e12, 1e12],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Valor inválido',
      error: mensagem || 'Digite um número ou deixe vazio.',
    };
  }
}

async function protegerAba(sh) {
  await sh.protect(SENHA, {
    selectLockedCells: true,
    selectUnlockedCells: true,
    autoFilter: true,
    sort: false,
    formatColumns: true,
    formatRows: false,
    insertRows: false,
    deleteRows: false,
  });
}

function novaAba(wb, nome, colunas, { titulo, subtitulo, filtros, gerado, xSplit = 2 }) {
  const sh = wb.addWorksheet(nome, { views: [{ state: 'frozen', xSplit, ySplit: LINHA_CAB, showGridLines: false }] });
  colunas.forEach(([, w], i) => (sh.getColumn(i + 1).width = w));
  cabecalho(wb, sh, { titulo, subtitulo, filtros, gerado, ultimaColuna: colunas.length });
  cabecalhoTabela(sh, LINHA_CAB, colunas.map(([r]) => r));
  return sh;
}

function linha(sh, n, valores, { zebra, moedas = [], meses = [], pcts = [] }) {
  const r = sh.getRow(n);
  r.values = valores;
  r.font = { size: 10, color: { argb: CORES.CINZA_ESCURO } };
  moedas.forEach((k) => (r.getCell(k).numFmt = FORMATOS.moeda));
  meses.forEach((k) => (r.getCell(k).numFmt = FORMATOS.mes));
  pcts.forEach((k) => (r.getCell(k).numFmt = FORMATOS.pct4));
  if (zebra) for (let k = 1; k <= valores.length; k += 1) r.getCell(k).fill = preencher(CORES.SLATE);
  return r;
}

// Recorte de um orçamento × etapa do assistente (`orcamentoId` + `etapa`): só o centro do rascunho, com
// a janela dele, e só a aba Valores com as naturezas da etapa (ex.: Custos da POC).
async function recorte(empresaId, { orcamentoId, etapa } = {}) {
  if (!orcamentoId) return null;
  const orc = await service.obter(empresaId, orcamentoId);
  if (orc.versao_id !== null) throw erro(400, 'Este orçamento já está numa versão salva.');
  if (!['poc', 'demais'].includes(etapa)) throw erro(400, 'Etapa inválida.');
  return { orc, etapa };
}

// ─── Layout ─────────────────────────────────────────────────────────────────────────────────────
async function layout(empresaId, usuarioId, opcoes = {}) {
  const rec = await recorte(empresaId, opcoes);
  const [todos, est, { centros: unidadesCentros }, { rows: emp }, { rows: usu }] = await Promise.all([
    centrosComOrcamento(empresaId),
    estrutura(empresaId),
    unidadesService.listar(empresaId),
    pool.query(`SELECT COALESCE(NULLIF(nome_fantasia, ''), razao_social) AS nome FROM empresas WHERE id = $1`, [empresaId]),
    pool.query('SELECT nome FROM usuarios WHERE id = $1', [usuarioId]),
  ]);
  const centros = rec
    ? todos.filter((c) => c.id === rec.orc.centro_id).map((c) => ({ ...c, rascunho: rec.orc, orc: rec.orc }))
    : todos;
  if (!centros.length) throw erro(400, 'Nenhum centro com "Realiza DRE" e Tipo definido (aba Centros Custos).');
  const empresa = emp[0]?.nome || `Empresa ${empresaId}`;
  const gerado = `Gerado por ${usu[0]?.nome || 'usuário'} em ${dataHora(new Date())}`;
  const atual = calculo.mesAtual();

  // Janela de cada centro: a do orçamento; sem orçamento, 24 meses a partir do mês atual.
  const janelas = await Promise.all(
    centros.map(async (c) => {
      const inicio = c.orc?.ciclo_inicio || atual;
      const fim = c.orc?.ciclo_fim || somarMeses(atual, MESES_PADRAO - 1);
      const trava = await travaPadrao(empresaId, c.id, c.orc, inicio);
      const j = calculo.janela({ ciclo_inicio: inicio, ciclo_fim: fim, trava });
      return { ...j, plano: await planoContas.planoDoCentro(empresaId, c.id) };
    })
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Horizon Finanças';
  const filtros = [
    ['Empresa', empresa],
    ['Valores', 'o rascunho de cada centro; sem rascunho, o orçamento da última versão'],
  ];

  // Ciclos e Vendas: só na planilha completa.
  if (!rec) {
  const shC = novaAba(wb, ABA.ciclos, COLUNAS.ciclos, {
    titulo: 'Projeção da DRE — Ciclos',
    subtitulo: 'Altere só as células amarelas. Centro com o ciclo em branco não é importado.',
    filtros,
    gerado,
  });
  centros.forEach((c, i) => {
    const o = c.orc;
    const r = linha(
      shC,
      LINHA_CAB + 1 + i,
      [
        c.id,
        c.nome,
        c.natureza === 'OBRA' ? 'Obra' : 'Administrativo',
        c.rascunho ? (c.rascunho.status === 'CONCLUIDO' ? 'Rascunho concluído' : 'Rascunho em andamento') : c.versao ? `Versão ${c.versao.numero}` : 'Sem orçamento',
        o ? dataExcel(o.ciclo_inicio) : null,
        o ? dataExcel(o.ciclo_fim) : null,
        o?.trava ? dataExcel(o.trava) : null,
      ],
      { zebra: i % 2 === 1, meses: [5, 6, 7] }
    );
    [5, 6, 7].forEach((k) => travarCelula(r.getCell(k), { tipo: 'mes' }));
  });
  shC.autoFilter = { from: { row: LINHA_CAB, column: 1 }, to: { row: LINHA_CAB + centros.length, column: COLUNAS.ciclos.length } };
  await protegerAba(shC);

  // Vendas
  const shV = novaAba(wb, ABA.vendas, COLUNAS.vendas, {
    titulo: 'Projeção da DRE — Vendas das unidades',
    subtitulo: 'Unidades disponíveis na trava de cada obra. Valor vazio = ticket médio do tipo; mês vazio = não vendida no ciclo.',
    filtros,
    gerado,
  });
  let nV = LINHA_CAB + 1;
  centros.forEach((c, i) => {
    if (c.natureza !== 'OBRA') return;
    const uc = unidadesCentros.find((x) => x.id === c.id);
    if (!uc) return;
    calculo.unidadesNaTrava(uc, janelas[i].travaFim).forEach((u) => {
      const { mes } = calculo.vendaDaUnidade(u, c.orc?.dados);
      const informado = c.orc?.dados?.unidades?.[u.chave]?.valor ?? u.venda_registrada?.valor ?? null;
      const r = linha(
        shV,
        nV,
        [c.id, c.nome, u.chave, u.unidade, u.tipo, u.fracao_ideal === null ? null : Number(u.fracao_ideal), u.ticket, informado, mes ? dataExcel(mes) : null],
        { zebra: nV % 2 === 0, moedas: [7, 8], meses: [9], pcts: [6] }
      );
      travarCelula(r.getCell(8), { mensagem: 'Digite o valor de venda ou deixe vazio (ticket médio).' });
      travarCelula(r.getCell(9), { tipo: 'mes' });
      nV += 1;
    });
  });
  if (nV > LINHA_CAB + 1) shV.autoFilter = { from: { row: LINHA_CAB, column: 1 }, to: { row: nV - 1, column: COLUNAS.vendas.length } };
  await protegerAba(shV);
  }

  // Valores: uma aba por etapa (no recorte, só a da etapa).
  let totalValores = 0;
  for (const etapa of rec ? [rec.etapa] : ['poc', 'demais']) {
    const shX = novaAba(wb, ABA[etapa], COLUNAS.valores, {
      titulo: `Projeção da DRE — ${TITULO_ETAPA[etapa]}`,
      subtitulo: 'Altere só a coluna Valor (despesa NEGATIVA, receita positiva; vazio limpa o mês). Naturezas HORIZON - INFORMADO e a Correção Monetária (ID CM).',
      filtros,
      gerado,
    });
    let nX = LINHA_CAB + 1;
    centros.forEach((c, i) => {
      const j = janelas[i];
      const { naturezas, correcao } = digitaveis(c, j.plano, est, etapa);
      const linhas = [...(correcao ? [correcao] : []), ...naturezas];
      linhas.forEach((nat) => {
        const atuais = nat.id === CORRECAO ? c.orc?.dados?.correcao || {} : c.orc?.dados?.valores?.[nat.id] || {};
        j.meses.forEach((mes) => {
          const v = atuais[mes];
          const r = linha(shX, nX, [c.id, c.nome, nat.id, nat.nome, nat.n1, nat.n2, dataExcel(mes), v === undefined || v === null ? null : Number(v)], {
            zebra: nX % 2 === 0,
            moedas: [8],
            meses: [7],
          });
          travarCelula(r.getCell(8), { mensagem: 'Digite um número (despesa negativa, receita positiva) ou deixe vazio para limpar.' });
          nX += 1;
        });
      });
    });
    totalValores += nX - LINHA_CAB - 1;
    if (totalValores > MAX_LINHAS) throw erro(400, `A planilha passaria de ${MAX_LINHAS} linhas de valores. Encurte os ciclos.`);
    if (nX > LINHA_CAB + 1) shX.autoFilter = { from: { row: LINHA_CAB, column: 1 }, to: { row: nX - 1, column: COLUNAS.valores.length } };
    await protegerAba(shX);
  }

  // Instruções
  const ins = wb.addWorksheet('Instruções', { views: [{ showGridLines: false }] });
  ins.getColumn(1).width = 4;
  ins.getColumn(2).width = 120;
  [
    ['Como usar a planilha da Projeção da DRE', true],
    ['1. Altere somente as células amarelas. As demais colunas e as linhas estão travadas.'],
    ['2. Ciclos: início, fim e "Realizado até" (a trava — último mês do realizado; a projeção começa no mês seguinte). Centro com o ciclo em branco não é importado.'],
    ['   "Realizado até" vazio: o mês anterior ao atual (centro com lançamentos) ou o mês antes do início do ciclo (centro novo).'],
    ['3. Vendas: valor e mês de venda de cada unidade disponível. Valor vazio = ticket médio do tipo; mês vazio = não vendida no ciclo.'],
    ['4. Custos da POC (só obras) e Demais contas: despesas com sinal NEGATIVO, receitas positivas; vazio limpa o mês. ID Natureza "CM" = Correção Monetária a realizar no mês.'],
    ['5. Mudou o ciclo ou a trava? Os meses e as unidades seguem o ciclo antigo: importe e baixe a planilha de novo para ver a janela nova.'],
    ['6. No Horizon Fin: DRE Construtoras › Projeções › Importar planilha. A prévia mostra o que muda em cada centro antes de gravar.'],
    ['7. A importação grava no rascunho de cada centro (cria se não houver) e pode concluir os orçamentos; a versão só é gravada em "Salvar versão".'],
    ['Só aparecem naturezas com Origem Projeção "HORIZON - INFORMADO" (aba Plano Contas). SIENGE - EMPRESARIAL e SIENGE - AGING vêm do Sienge.'],
  ].forEach(([t, titulo], i) => {
    const c = ins.getCell(i + 2, 2);
    c.value = t;
    c.font = titulo ? { bold: true, size: 14, color: { argb: CORES.AZUL_ESCURO } } : { size: 11, color: { argb: CORES.CINZA_ESCURO } };
    c.alignment = { wrapText: true, vertical: 'top' };
  });
  await ins.protect(SENHA, { selectLockedCells: true, selectUnlockedCells: true });

  const meta = wb.addWorksheet(ABA.meta, { state: 'veryHidden' });
  meta.getCell('A1').value = 'empresa_id';
  meta.getCell('B1').value = Number(empresaId);
  meta.getCell('A2').value = 'gerado_em';
  meta.getCell('B2').value = dataHoraExcel(new Date());
  meta.getCell('A3').value = 'tipo';
  meta.getCell('B3').value = 'PROJECAO_DRE';
  await meta.protect(SENHA, {});

  const buffer = await corrigirArquivo(await wb.xlsx.writeBuffer());
  const nome = rec
    ? `Projeção DRE - ${centros[0].nome} - ${rec.etapa === 'poc' ? 'Custos da POC' : 'Demais contas'}.xlsx`
    : `Projeção DRE - ${empresa} - ${rotuloMes(atual).replace('/', '-')}.xlsx`;
  return { buffer, nome };
}

// ─── Importação ─────────────────────────────────────────────────────────────────────────────────
const vazia = (v) => v === null || v === undefined || v === '';
const texto = (v) => (vazia(v) ? '' : String(typeof v === 'object' && v.result !== undefined ? v.result : v).trim());

function conferirCabecalho(sh, colunas, nome) {
  const ok = colunas.every(([rotulo], i) => texto(sh.getRow(LINHA_CAB).getCell(i + 1).value) === rotulo);
  if (!ok) throw erro(400, `O cabeçalho da aba "${nome}" não é o do layout da Projeção da DRE. Baixe o layout de novo.`);
}

// Lê a planilha e monta, por centro, o que vai pro rascunho; `aplicar` grava (e conclui, com `concluir`).
// Com `orcamentoId` + `etapa` (assistente): só a aba Valores, só o centro do rascunho e as naturezas da
// etapa — linhas de outros centros / naturezas são ignoradas; grava só os valores (o ciclo não muda).
async function importar(empresaId, { buffer, arquivo }, usuarioId, { aplicar = false, concluir = false, orcamentoId = null, etapa = null } = {}) {
  const rec = await recorte(empresaId, { orcamentoId, etapa });
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw erro(400, 'Não foi possível ler o arquivo. Envie o .xlsx baixado em "Layout da projeção".');
  }
  const shC = wb.getWorksheet(ABA.ciclos);
  const shV = wb.getWorksheet(ABA.vendas);
  const abasValores = (rec ? [rec.etapa] : ['poc', 'demais']).map((etapa) => ({ etapa, nome: ABA[etapa], sh: wb.getWorksheet(ABA[etapa]) }));
  if (rec ? !abasValores[0].sh : !shC || !shV || abasValores.some((a) => !a.sh)) {
    throw erro(
      400,
      rec
        ? `A planilha precisa ter a aba "${ABA[rec.etapa]}" do layout da Projeção da DRE. Baixe o layout de novo.`
        : 'A planilha precisa ter as abas Ciclos, Vendas, Custos da POC e Demais contas do layout da Projeção da DRE. Baixe o layout de novo.'
    );
  }
  const meta = wb.getWorksheet(ABA.meta);
  const empresaArquivo = meta ? inteiro(meta.getCell('B1').value) : null;
  if (empresaArquivo && empresaArquivo !== Number(empresaId)) throw erro(400, 'Esta planilha foi gerada para outra empresa. Baixe o layout da empresa selecionada.');
  if (!rec) {
    conferirCabecalho(shC, COLUNAS.ciclos, ABA.ciclos);
    conferirCabecalho(shV, COLUNAS.vendas, ABA.vendas);
  }
  abasValores.forEach((a) => conferirCabecalho(a.sh, COLUNAS.valores, a.nome));

  const [centros, est, { centros: unidadesCentros }] = await Promise.all([
    centrosComOrcamento(empresaId),
    estrutura(empresaId),
    unidadesService.listar(empresaId),
  ]);
  if (rec) {
    const c = centros.find((x) => x.id === rec.orc.centro_id);
    if (c) Object.assign(c, { rascunho: rec.orc, orc: rec.orc });
  }
  const porId = new Map(centros.map((c) => [c.id, c]));
  const erros = [];
  const falha = (aba, n, msg) => erros.length < 300 && erros.push({ aba, linha: n, erro: msg });
  const atual = calculo.mesAtual();

  // Ciclos (no recorte: o do rascunho)
  const ciclos = new Map();
  if (rec) ciclos.set(rec.orc.centro_id, { inicio: rec.orc.ciclo_inicio, fim: rec.orc.ciclo_fim, trava: rec.orc.trava, linha: null });
  for (let n = LINHA_CAB + 1; !rec && n <= shC.rowCount; n += 1) {
    const r = shC.getRow(n);
    const id = inteiro(r.getCell(1).value);
    const [ini, fim, trv] = [5, 6, 7].map((k) => r.getCell(k).value);
    if (!id) continue;
    if ([ini, fim, trv].every(vazia)) continue;
    const c = porId.get(id);
    if (!c) {
      falha(ABA.ciclos, n, `Centro ${id} não está com "Realiza DRE" e Tipo definido.`);
      continue;
    }
    const inicio = mesDaCelula(ini);
    const final = mesDaCelula(fim);
    const trava = vazia(trv) ? null : mesDaCelula(trv);
    if (!inicio || !final) {
      falha(ABA.ciclos, n, `${c.nome}: informe o início e o fim do ciclo (ou deixe as três células vazias).`);
      continue;
    }
    if (final < inicio) {
      falha(ABA.ciclos, n, `${c.nome}: o fim do ciclo é antes do início.`);
      continue;
    }
    if (trava === undefined) {
      falha(ABA.ciclos, n, `${c.nome}: "Realizado até" não é um mês.`);
      continue;
    }
    if (trava && trava > atual) {
      falha(ABA.ciclos, n, `${c.nome}: "Realizado até" não pode ser depois do mês atual.`);
      continue;
    }
    if (trava && trava >= final) {
      falha(ABA.ciclos, n, `${c.nome}: "Realizado até" precisa ser antes do fim do ciclo.`);
      continue;
    }
    ciclos.set(id, { inicio, fim: final, trava, linha: n });
  }

  // Janela, digitáveis e unidades de cada centro do ciclo.
  const contexto = new Map();
  for (const [id, ci] of ciclos) {
    const c = porId.get(id);
    const trava = ci.trava || (await travaPadrao(empresaId, id, c.orc, ci.inicio));
    const j = calculo.janela({ ciclo_inicio: ci.inicio, ciclo_fim: ci.fim, trava });
    if (!j.meses.length) {
      falha(ABA.ciclos, ci.linha, `${c.nome}: não sobra mês projetado (a trava precisa ser antes do fim do ciclo).`);
      continue;
    }
    const plano = await planoContas.planoDoCentro(empresaId, id);
    const porEtapa = Object.fromEntries(
      abasValores.map(({ etapa }) => {
        const d = digitaveis(c, plano, est, etapa);
        return [etapa, new Set([...d.naturezas.map((x) => x.id), ...(d.correcao ? [CORRECAO] : [])])];
      })
    );
    const uc = c.natureza === 'OBRA' ? unidadesCentros.find((x) => x.id === id) : null;
    contexto.set(id, {
      c,
      ci: { ...ci, trava },
      j,
      meses: new Set(j.meses),
      naturezas: porEtapa,
      unidades: new Map((uc ? calculo.unidadesNaTrava(uc, j.travaFim) : []).map((u) => [u.chave, u])),
      valores: new Map(),
      vendas: new Map(),
    });
  }

  // Valores (Custos da POC e Demais contas)
  const semCiclo = new Set();
  const vistos = new Map();
  for (const { etapa, nome: aba, sh: shX } of abasValores) {
    const ultima = Math.min(shX.rowCount, LINHA_CAB + MAX_LINHAS);
    for (let n = LINHA_CAB + 1; n <= ultima; n += 1) {
      const r = shX.getRow(n);
      const id = inteiro(r.getCell(1).value);
      const nat = texto(r.getCell(3).value);
      const mesV = r.getCell(7).value;
      const valV = r.getCell(8).value;
      if (!id && !nat && vazia(mesV) && vazia(valV)) continue;
      const ctx = contexto.get(id);
      const valor = valorDaCelula(valV);
      if (!ctx) {
        if (!rec && !vazia(valV) && !ciclos.has(id)) semCiclo.add(id);
        continue;
      }
      const mes = mesDaCelula(mesV);
      if (!mes) {
        falha(aba, n, 'Mês inválido (use o mês do layout).');
        continue;
      }
      if (valor === undefined) {
        falha(aba, n, `Valor "${texto(valV)}" não é um número.`);
        continue;
      }
      if (!ctx.naturezas[etapa].has(nat)) {
        if (!rec) falha(aba, n, `${ctx.c.nome}: a natureza ${nat} não é HORIZON - INFORMADO nas máscaras de ${TITULO_ETAPA[etapa]} do centro.`);
        continue;
      }
      if (!ctx.meses.has(mes)) {
        if (valor !== null) falha(aba, n, `${ctx.c.nome}: ${rotuloMes(mes)} está fora dos meses projetados (${rotuloMes(ctx.j.inicioProjecao)} a ${rotuloMes(ctx.j.cicloFim)}).`);
        continue;
      }
      const chave = `${id}|${nat}|${mes}`;
      if (vistos.has(chave)) {
        falha(aba, n, `Repetida (mesmo centro, natureza e mês da linha ${vistos.get(chave)}).`);
        continue;
      }
      vistos.set(chave, n);
      if (!ctx.valores.has(nat)) ctx.valores.set(nat, {});
      ctx.valores.get(nat)[mes] = valor === 0 ? null : valor;
    }
    if (shX.rowCount > LINHA_CAB + MAX_LINHAS) erros.push({ aba, linha: null, erro: `Mais de ${MAX_LINHAS} linhas: só as primeiras foram lidas.` });
  }

  // Vendas (não no recorte)
  for (let n = LINHA_CAB + 1; !rec && n <= shV.rowCount; n += 1) {
    const r = shV.getRow(n);
    const id = inteiro(r.getCell(1).value);
    const chave = texto(r.getCell(3).value);
    const valV = r.getCell(8).value;
    const mesV = r.getCell(9).value;
    if (!id && !chave) continue;
    const ctx = contexto.get(id);
    if (!ctx) {
      if ((!vazia(valV) || !vazia(mesV)) && !ciclos.has(id)) semCiclo.add(id);
      continue;
    }
    const u = ctx.unidades.get(chave);
    const mes = vazia(mesV) ? null : mesDaCelula(mesV);
    const valor = valorDaCelula(valV);
    if (!u) {
      if (!vazia(mesV)) falha(ABA.vendas, n, `${ctx.c.nome}: a unidade ${texto(r.getCell(4).value) || chave} não está disponível na trava ${rotuloMes(ctx.ci.trava)}.`);
      continue;
    }
    if (mes === undefined) {
      falha(ABA.vendas, n, 'Mês de venda inválido.');
      continue;
    }
    if (valor === undefined) {
      falha(ABA.vendas, n, `Valor "${texto(valV)}" não é um número.`);
      continue;
    }
    if (mes && !ctx.meses.has(mes)) {
      falha(ABA.vendas, n, `${ctx.c.nome}: venda em ${rotuloMes(mes)} fora dos meses projetados (${rotuloMes(ctx.j.inicioProjecao)} a ${rotuloMes(ctx.j.cicloFim)}).`);
      continue;
    }
    // Valor igual ao da venda registrada / ticket = vazio (segue a regra do assistente).
    const padrao = u.venda_registrada?.valor ?? u.ticket ?? null;
    ctx.vendas.set(chave, { mes, valor: valor === null || centavos(valor) === centavos(padrao) ? null : valor });
  }
  // Ciclo em branco = centro não importado (os valores dele são ignorados). Só avisa quando o centro não
  // tem orçamento nenhum e há algo preenchido — provavelmente esqueceram o ciclo.
  const avisos = [];
  semCiclo.forEach((id) => {
    const c = porId.get(id);
    if (c && !c.orc) avisos.push(`${c.nome}: há valores ou vendas preenchidos, mas o ciclo está em branco — o centro não será importado.`);
  });

  // Por centro: os dados novos e o que muda em relação ao orçamento atual.
  const centrosPrevia = [];
  for (const [id, ctx] of contexto) {
    const base = ctx.c.orc?.dados || {};
    const dados = { ...base, valores: { ...(base.valores || {}) }, correcao: { ...(base.correcao || {}) }, unidades: { ...(base.unidades || {}) } };
    let incluidos = 0;
    let alterados = 0;
    let limpos = 0;
    ctx.valores.forEach((porMes, nat) => {
      const atualLinha = nat === CORRECAO ? dados.correcao : { ...(dados.valores[nat] || {}) };
      Object.entries(porMes).forEach(([mes, v]) => {
        const antes = atualLinha[mes] ?? null;
        if (centavos(antes) === centavos(v)) return;
        if (v === null) {
          limpos += 1;
          delete atualLinha[mes];
        } else {
          if (antes === null) incluidos += 1;
          else alterados += 1;
          atualLinha[mes] = v;
        }
      });
      if (nat !== CORRECAO) dados.valores[nat] = atualLinha;
    });
    let vendasMudadas = 0;
    ctx.vendas.forEach((v, chave) => {
      const u = ctx.unidades.get(chave);
      const antes = calculo.vendaDaUnidade(u, base);
      const depois = calculo.vendaDaUnidade(u, { unidades: { [chave]: v } });
      if (antes.mes !== depois.mes || centavos(antes.valor) !== centavos(depois.valor)) vendasMudadas += 1;
      dados.unidades[chave] = v;
    });
    const comVenda = [...ctx.unidades.values()].filter((u) => {
      const { mes } = calculo.vendaDaUnidade(u, dados);
      return mes && ctx.meses.has(mes);
    }).length;
    const o = ctx.c.orc;
    const cicloMudou = !o || o.ciclo_inicio !== ctx.ci.inicio || o.ciclo_fim !== ctx.ci.fim || o.trava !== ctx.ci.trava;
    const mudancas = incluidos + alterados + limpos + vendasMudadas;
    centrosPrevia.push({
      centro_id: id,
      muda: cicloMudou || mudancas > 0,
      centro: ctx.c.nome,
      natureza: ctx.c.natureza,
      acao: ctx.c.rascunho ? 'ATUALIZA' : 'CRIA',
      ciclo_inicio: ctx.ci.inicio,
      ciclo_fim: ctx.ci.fim,
      trava: ctx.ci.trava,
      ciclo_mudou: cicloMudou,
      incluidos,
      alterados,
      limpos,
      vendas_mudadas: vendasMudadas,
      unidades: ctx.unidades.size,
      com_venda: comVenda,
      dados,
    });
  }
  const resumo = {
    centros: centrosPrevia.filter((c) => c.muda).length,
    sem_mudanca: centrosPrevia.filter((c) => !c.muda).length,
    criados: centrosPrevia.filter((c) => c.acao === 'CRIA').length,
    valores: centrosPrevia.reduce((t, c) => t + c.incluidos + c.alterados + c.limpos, 0),
    vendas: centrosPrevia.reduce((t, c) => t + c.vendas_mudadas, 0),
  };
  const semDados = (c) => {
    const { dados, ...resto } = c;
    return resto;
  };
  if (!centrosPrevia.length && !erros.length) throw erro(400, 'Nenhum centro com ciclo preenchido na aba Ciclos.');
  if (!aplicar || erros.length) return { aplicado: false, resumo, erros, avisos, centros: centrosPrevia.map(semDados) };
  if (!resumo.centros) return { aplicado: false, resumo, erros, avisos, centros: centrosPrevia.map(semDados), aviso: 'Nada mudou em relação aos orçamentos atuais.' };

  // Grava só os centros que mudam: cria o rascunho que falta e atualiza (ciclo, trava, dados); conclui
  // se pedido. Centro sem mudança fica como está (um rascunho concluído continua concluído).
  const concluidos = [];
  const falhas = [];
  for (const c of centrosPrevia.filter((x) => x.muda)) {
    let id = contexto.get(c.centro_id).c.rascunho?.id;
    if (!id) {
      const novo = await service.criar(empresaId, { centroId: c.centro_id, cicloInicio: c.ciclo_inicio, cicloFim: c.ciclo_fim }, usuarioId);
      id = novo.id;
    }
    await service.atualizar(
      empresaId,
      id,
      rec
        ? { dados: c.dados }
        : { cicloInicio: c.ciclo_inicio, cicloFim: c.ciclo_fim, trava: c.trava, dados: c.dados, etapa: concluir ? 'demais' : undefined },
      usuarioId
    );
    if (concluir && !rec) {
      try {
        await service.concluir(empresaId, id, usuarioId);
        concluidos.push(c.centro_id);
      } catch (e) {
        falhas.push({ centro: c.centro, erro: e.message });
      }
    }
  }
  const final = { aplicado: true, resumo, erros: [], avisos, centros: centrosPrevia.map(semDados), concluidos: concluidos.length, falhas };
  // No recorte, devolve os dados do rascunho pra o assistente atualizar a tela.
  if (rec) final.dados = centrosPrevia[0]?.dados || rec.orc.dados;
  return final;
}

module.exports = { layout, importar };
