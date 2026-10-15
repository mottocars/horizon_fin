const { CORES, FORMATOS, borda, preencher, dataExcel, cabecalho, faixa, cabecalhoTabela, impressao } = require('../../../utils/excelMarca');

// Aba "CEF - <obra>": o dossiê da Projeção CEF com FÓRMULAS VIVAS (pedido do usuário) — clicando
// numa célula se vê de onde o número vem. Réplica de projecaoCef.motor::projetar/calcularUnidades:
// 1) obra e parâmetros (células nomeadas usadas nas fórmulas);
// 2) avanço da obra (Caixa/DCD, Prevision, manual -> % usado) e a memória de cálculo mês a mês;
// 3) até a plotagem: calculado (fórmula) × projeção gravada × versão do Orçamento, com Δ (deve ser 0);
// 4) unidades do Geral, com o mês do registro, % de obra e novo registro calculados por fórmula.
// Os valores do sistema vão junto como resultado em cache; o Excel recalcula ao abrir.

const MESES_CAB = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const rotuloMes = (m) => (m ? `${MESES_CAB[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}` : '—');
const dataBr = (v) => {
  if (!v) return '—';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return s.slice(0, 10).split('-').reverse().join('/');
};
const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const ROTULO_FONTE = { CAIXA: 'Caixa (DCD)', PREVISION: 'Prevision', MANUAL: 'Manual' };
const mesIso = (v) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 7);

// Componentes da Projeção CEF: coluna da memória e sinal no fluxo (saída = negativo).
const COMPONENTES = [
  { origem: 'CEF_NOVO_REGISTRO', nome: 'Novo Registro', col: 'J', sinal: 1, campo: 'novo_registro' },
  { origem: 'CEF_MEDICAO', nome: 'Medição', col: 'M', sinal: 1, campo: 'medicao' },
  { origem: 'CEF_CREDITO_PJ', nome: 'Crédito PJ', col: 'O', sinal: 1, campo: 'credito_pj' },
  { origem: 'CEF_JUROS', nome: 'Juros', col: 'R', sinal: -1, campo: 'juros' },
  { origem: 'CEF_AMORTIZACAO', nome: 'Amortização', col: 'S', sinal: -1, campo: 'amortizacao' },
];

const MEMORIA = [
  ['Mês', 11, 'mes', ''],
  ['Caixa (DCD)', 10, 'pct', 'Avanço acumulado da Caixa'],
  ['Prevision', 10, 'pct', 'Avanço acumulado do Prevision'],
  ['Manual', 10, 'pct', 'Avanço manual'],
  ['Fonte do avanço', 24, null, 'Caixa até o mês anterior ao atual; Prevision/manual depois'],
  ['% obra acumulado', 10, 'pct', 'Avanço usado (vazio = repete o anterior)'],
  ['Δ obra no mês', 10, 'pct', '= % do mês − % do mês anterior'],
  ['Registros no mês', 9, 'int', 'Unidades com registro no mês'],
  ['VGF medição registrados no mês', 14, 'moeda', 'Σ VGF medição das unidades do mês'],
  ['Novo Registro', 14, 'moeda', 'Σ novo registro das unidades do mês'],
  ['Novo registro que não amortiza', 14, 'moeda', 'Unidades assinadas até a Data da DM'],
  ['VGF medição acumulado', 15, 'moeda', '= acumulado + VGF do mês anterior'],
  ['Medição', 14, 'moeda', '= VGF medição acumulado × Δ obra'],
  ['Crédito calculado', 14, 'moeda', 'Até a DM: 0 · mês seguinte: Teto × Δ · depois: CTO × Δ − Medição'],
  ['Crédito PJ', 14, 'moeda', 'Nunca negativo, travado no teto'],
  ['Crédito PJ acumulado', 15, 'moeda', '= acumulado anterior + Crédito PJ'],
  ['Saldo devedor inicial', 15, 'moeda', '= saldo devedor final do mês anterior'],
  ['Juros', 13, 'moeda', '= saldo devedor inicial × taxa de juros'],
  ['Amortização', 14, 'moeda', '= (Novo Registro − não amortiza) × % amortização'],
  ['Saldo devedor final', 15, 'moeda', '= inicial + Crédito PJ − Amortização'],
  ['', 14, null, ''],
];
const ULTIMA = MEMORIA.length; // 21 colunas (A..U)

const FORMATO = { mes: FORMATOS.mes, pct: FORMATOS.pct, int: FORMATOS.int, moeda: FORMATOS.moeda, data: FORMATOS.data };

function nomeAba(nome) {
  return `CEF - ${nome}`.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim();
}

function slugDe(nome, usados, id) {
  let s = String(nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 20);
  if (!s || usados.has(s)) s = `${s}${id}`;
  usados.add(s);
  return s;
}

function textoCenario(cenario, mesAtual, somarMeses) {
  const antes = rotuloMes(somarMeses(mesAtual, -1));
  const depois = rotuloMes(mesAtual);
  return (
    {
      CAIXA_PREVISION: `Caixa (DCD) até ${antes}; Prevision a partir de ${depois}`,
      CAIXA: `Caixa (DCD) até ${antes}; avanço manual a partir de ${depois}`,
      PREVISION: 'Prevision em todos os meses',
      MANUAL: 'Avanço manual em todos os meses',
      SEM_DADOS: 'Sem avanço cadastrado (0%)',
    }[cenario] || cenario
  );
}

module.exports = function planilhaCef(workbook, obra, d, meta, usados, nome) {
  const { p, linhas, unidades, porUnidade, mapa, fontes, bruto, cenario, versao, exec } = obra;
  const somarMeses = d.fluxo.somarMeses;
  const slug = slugDe(obra.obra.name, usados, obra.obra.sienge_id);
  const NOME = (n) => `${n}_${slug}`;
  const sheet = workbook.addWorksheet(nome || nomeAba(obra.obra.name), {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 0, showGridLines: false }],
  });
  MEMORIA.forEach(([, w], i) => (sheet.getColumn(i + 1).width = w));
  cabecalho(workbook, sheet, {
    titulo: `Projeção CEF — ${obra.obra.name}`,
    subtitulo:
      'Dossiê com fórmulas vivas: clique numa célula para ver a conta. Mês em azul = dentro do período exportado. A coluna Δ (até a plotagem) deve dar zero.',
    filtros: meta.filtros,
    gerado: meta.gerado,
    ultimaColuna: ULTIMA,
  });

  const n = linhas.length;
  const u = unidades.length;
  const MEM0 = 21;
  const MEMN = MEM0 + Math.max(n, 1) - 1;
  const PLOT_FAIXA = MEMN + 2;
  const PLOT_CAB1 = PLOT_FAIXA + 1;
  const PLOT_CAB2 = PLOT_CAB1 + 1;
  const PLOT0 = PLOT_CAB2 + 1;
  const PLOTN = PLOT0 + Math.max(n, 1) - 1;
  const UN_FAIXA = PLOTN + 2;
  const UN_CAB = UN_FAIXA + 1;
  const UN_REGRA = UN_CAB + 1;
  const UN0 = UN_REGRA + 1;
  const UNN = UN0 + Math.max(u, 1) - 1;
  const intervalo = (col) => `$${col}$${UN0}:$${col}$${UNN}`;
  const memIntervalo = (col) => `$${col}$${MEM0}:$${col}$${MEMN}`;

  // ─── 1) Obra e parâmetros ────────────────────────────────────────────────────────────────────
  faixa(sheet, 6, 'OBRA E PROJEÇÃO', 1, 9);
  faixa(sheet, 6, `PARÂMETROS — VERSÃO ${versao.versao}`, 11, ULTIMA);
  const item = (linha, de, ateRotulo, ateValor, rotulo, valor, formato) => {
    sheet.mergeCells(linha, de, linha, ateRotulo);
    sheet.mergeCells(linha, ateRotulo + 1, linha, ateValor);
    const r = sheet.getCell(linha, de);
    r.value = rotulo;
    r.font = { size: 9, color: { argb: CORES.CINZA } };
    r.alignment = { vertical: 'middle', indent: 1 };
    const v = sheet.getCell(linha, ateRotulo + 1);
    v.value = valor;
    v.font = { size: 10, bold: true, color: { argb: CORES.PRETO } };
    v.alignment = { vertical: 'middle', horizontal: 'left' };
    if (formato) v.numFmt = formato;
    for (let c = de; c <= ateValor; c += 1) sheet.getCell(linha, c).border = { bottom: borda() };
    return v;
  };
  const somaAbs = (a, b) =>
    COMPONENTES.map((_, i) => {
      const colA = sheet.getColumn(2 + i * 4 + a).letter;
      const colB = sheet.getColumn(2 + i * 4 + b).letter;
      return `SUMPRODUCT(ABS(${colA}${PLOT0}:${colA}${PLOTN}-${colB}${PLOT0}:${colB}${PLOTN}))`;
    }).join('+');
  const ok = (fx) => ({ formula: `IF(${fx}<0.05,"OK — bate","Há diferença — veja a coluna Δ")`, result: 'OK — bate' });
  const esquerda = [
    ['Obra', obra.obra.name],
    ['Contrato Caixa', /^\d+$/.test(obra.obra.contrato) ? Number(obra.obra.contrato) : obra.obra.contrato],
    ['Parâmetros', `Versão ${versao.versao}${versao.criado_por_nome ? ` — ${versao.criado_por_nome}` : ''}, ${dataBr(versao.criado_em)}`],
    ['Projeção CEF atualizada', `${dataBr(exec.atualizado_em)}${exec.usuario ? ` por ${exec.usuario}` : ''}`],
    ['Avanço da obra', textoCenario(cenario, obra.mesAtual, somarMeses)],
    ['Unidades do Geral', `${u} (sem o 1º contrato, o da construtora)`],
    ['Memória × projeção gravada', ok(somaAbs(0, 1))],
    ['Projeção gravada × versão do Orçamento', ok(somaAbs(1, 2))],
  ];
  esquerda.forEach(([r, v], i) => item(7 + i, 1, 4, 9, r, v, typeof v === 'number' ? '0' : null));
  const parametros = [
    ['CTO', 'CTO', p.cto, FORMATOS.moeda],
    ['TETO', 'Teto do financiamento PJ', p.tetoPj, FORMATOS.moeda],
    ['AMORT', '% Amortização PJ', p.amortPj, FORMATOS.pct],
    ['JUROS', 'Taxa de juros ao mês', p.taxaJuros, FORMATOS.pct4],
    ['DM', 'Data da Demanda Mínima', dataExcel(p.dataDemandaMinima), FORMATOS.data],
    ['DMMES', 'Mês da Demanda Mínima', null, FORMATOS.mes],
    ['INICIO', 'Início do ciclo', dataExcel(linhas[0]?.mes), FORMATOS.mes],
    ['FIM', 'Fim do ciclo', dataExcel(linhas[linhas.length - 1]?.mes), FORMATOS.mes],
    ['PRAZO', 'Assinatura → registro (meses)', Math.trunc(p.prazoRegistro || 0), '0'],
    ['MESATUAL', 'Mês atual (corte Caixa → Prevision)', dataExcel(obra.mesAtual), FORMATOS.mes],
  ];
  parametros.forEach(([nome, rotulo, valor, formato], i) => {
    const cel = item(7 + i, 11, 15, 18, rotulo, valor, formato);
    cel.name = NOME(nome);
    if (nome === 'DMMES') cel.value = { formula: `DATE(YEAR(${NOME('DM')}),MONTH(${NOME('DM')}),1)`, result: dataExcel(mesIso(p.dataDemandaMinima)) };
  });

  // ─── 2) Avanço e memória de cálculo ─────────────────────────────────────────────────────────
  const linhaFaixa = MEM0 - 3;
  faixa(sheet, linhaFaixa, 'AVANÇO DA OBRA E MEMÓRIA DE CÁLCULO (mês a mês do ciclo)', 1, ULTIMA);
  cabecalhoTabela(sheet, MEM0 - 2, MEMORIA.slice(0, 20).map(([r]) => r));
  MEMORIA.slice(0, 20).forEach(([, , , regra], i) => {
    const c = sheet.getCell(MEM0 - 1, i + 1);
    c.value = regra;
    c.font = { size: 8, italic: true, color: { argb: CORES.CINZA } };
    c.alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
    c.fill = preencher(CORES.CINZA_CLARO);
  });
  sheet.getRow(MEM0 - 1).height = 46;

  const periodo = new Set(d.fluxo.meses);
  const pct = (v) => (v === null || v === undefined ? null : Number(v) / 100);
  const escolha = (col, r, anterior) => `IF(${col}${r}="",${anterior},MIN(MAX(${col}${r},0),1))`;
  const mesDm = mesIso(p.dataDemandaMinima);
  let cumO = 0;
  let cumCred = 0;
  linhas.forEach((l, i) => {
    const r = MEM0 + i;
    const prim = i === 0;
    const ant = r - 1;
    const Fp = prim ? '0' : `F${ant}`;
    const fonte = fontes.get(l.mes);
    const formulaF =
      {
        CAIXA_PREVISION: `IF(A${r}<${NOME('MESATUAL')},${escolha('B', r, Fp)},${escolha('C', r, Fp)})`,
        CAIXA: `IF(A${r}<${NOME('MESATUAL')},${escolha('B', r, Fp)},${escolha('D', r, Fp)})`,
        PREVISION: escolha('C', r, Fp),
        MANUAL: escolha('D', r, Fp),
      }[cenario] || '0';
    const temUn = u > 0;
    const cumOAntes = cumO;
    const cumCredAntes = cumCred;
    cumO += l.vgf_medicao;
    cumCred += l.credito_pj;
    const valores = [
      dataExcel(l.mes),
      pct(bruto?.pls?.[l.mes]),
      pct(bruto?.prevision?.[l.mes]),
      pct(bruto?.manual?.[l.mes]),
      fonte ? `${ROTULO_FONTE[fonte.fonte] || fonte.fonte}${fonte.repetido ? ' (repete o anterior)' : ''}` : '—',
      { formula: formulaF, result: l.pct_obra_executada },
      { formula: prim ? `F${r}` : `F${r}-F${ant}`, result: l.delta_pct_obra_mes },
      temUn ? { formula: `COUNTIFS(${intervalo('D')},A${r})`, result: l.qtd_registro } : 0,
      temUn ? { formula: `SUMIFS(${intervalo('J')},${intervalo('D')},A${r})`, result: l.vgf_medicao } : 0,
      temUn ? { formula: `SUMIFS(${intervalo('M')},${intervalo('D')},A${r})`, result: l.novo_registro } : 0,
      temUn ? { formula: `SUMIFS(${intervalo('M')},${intervalo('D')},A${r},${intervalo('N')},"Não")`, result: l.novo_registro_nao_amortizacao } : 0,
      { formula: prim ? '0' : `L${ant}+I${ant}`, result: cumOAntes },
      { formula: `L${r}*G${r}`, result: l.medicao },
      {
        formula: `IF(A${r}<=${NOME('DMMES')},0,IF(A${r}=EDATE(${NOME('DMMES')},1),${NOME('TETO')}*G${r},${NOME('CTO')}*G${r}-M${r}))`,
        // Valor antes da trava (o motor guarda já travado em valor_maximo_pj).
        result: l.mes <= mesDm ? 0 : l.mes === somarMeses(mesDm, 1) ? p.tetoPj * l.delta_pct_obra_mes : p.cto * l.delta_pct_obra_mes - l.medicao,
      },
      { formula: `MIN(MAX(N${r},0),MAX(${NOME('TETO')}-${prim ? '0' : `P${ant}`},0))`, result: l.credito_pj },
      { formula: prim ? `O${r}` : `P${ant}+O${r}`, result: cumCredAntes + l.credito_pj },
      { formula: prim ? '0' : `T${ant}`, result: prim ? 0 : linhas[i - 1].saldo_devedor_pj },
      { formula: `Q${r}*${NOME('JUROS')}`, result: l.juros },
      { formula: `(J${r}-K${r})*${NOME('AMORT')}`, result: l.amortizacao },
      { formula: `Q${r}+O${r}-S${r}`, result: l.saldo_devedor_pj },
    ];
    const row = sheet.getRow(r);
    valores.forEach((v, j) => {
      const cel = row.getCell(j + 1);
      cel.value = v;
      const formato = MEMORIA[j][2];
      if (formato) cel.numFmt = FORMATO[formato];
      cel.font = { size: 9, color: { argb: [9, 12, 14, 17, 18].includes(j) ? CORES.PRETO : CORES.CINZA_ESCURO }, bold: [9, 12, 14, 17, 18].includes(j) };
      cel.border = { bottom: borda() };
      cel.alignment = { vertical: 'middle', horizontal: j === 4 ? 'left' : j === 0 ? 'center' : 'right' };
    });
    if (periodo.has(l.mes)) {
      const a = row.getCell(1);
      a.fill = preencher(CORES.AZUL_CLARO);
      a.font = { size: 9, bold: true, color: { argb: CORES.AZUL_ESCURO } };
    }
  });

  // ─── 3) Até a plotagem ──────────────────────────────────────────────────────────────────────
  faixa(sheet, PLOT_FAIXA, `ATÉ A PLOTAGEM NO DFC — calculado (memória) × projeção gravada × versão ${d.fluxo.versao?.numero ?? '—'} do Orçamento`, 1, ULTIMA);
  sheet.mergeCells(PLOT_CAB1, 1, PLOT_CAB2, 1);
  const cMes = sheet.getCell(PLOT_CAB1, 1);
  cMes.value = 'Mês';
  cMes.font = { bold: true, size: 9, color: { argb: CORES.BRANCO } };
  cMes.fill = preencher(CORES.AZUL_ESCURO);
  cMes.alignment = { vertical: 'middle', horizontal: 'center' };
  COMPONENTES.forEach((c, i) => {
    const de = 2 + i * 4;
    sheet.mergeCells(PLOT_CAB1, de, PLOT_CAB1, de + 3);
    const conta = obra.contas[c.origem];
    const cab = sheet.getCell(PLOT_CAB1, de);
    cab.value = conta ? `${c.nome} → ${conta.sienge_id} ${conta.name || ''}`.trim() : `${c.nome} → sem conta no plano`;
    cab.font = { bold: true, size: 9, color: { argb: CORES.BRANCO } };
    cab.fill = preencher(CORES.AZUL_ESCURO);
    cab.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    ['Calculado', 'Projeção gravada', `Versão ${d.fluxo.versao?.numero ?? '—'}`, 'Δ'].forEach((t, j) => {
      const cel = sheet.getCell(PLOT_CAB2, de + j);
      cel.value = t;
      cel.font = { bold: true, size: 8, color: { argb: j === 3 ? CORES.VERMELHO : CORES.CINZA_ESCURO } };
      cel.fill = preencher(CORES.AZUL_CLARO);
      cel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cel.border = { left: j === 0 ? borda(CORES.CINZA_BORDA) : undefined };
    });
  });
  sheet.getRow(PLOT_CAB1).height = 28;
  sheet.getRow(PLOT_CAB2).height = 22;
  linhas.forEach((l, i) => {
    const r = PLOT0 + i;
    const rm = MEM0 + i;
    const row = sheet.getRow(r);
    const a = row.getCell(1);
    a.value = { formula: `A${rm}`, result: dataExcel(l.mes) };
    a.numFmt = FORMATOS.mes;
    a.font = { size: 9, bold: periodo.has(l.mes), color: { argb: periodo.has(l.mes) ? CORES.AZUL_ESCURO : CORES.CINZA_ESCURO } };
    if (periodo.has(l.mes)) a.fill = preencher(CORES.AZUL_CLARO);
    a.alignment = { horizontal: 'center' };
    a.border = { bottom: borda() };
    const gravada = obra.gravadas.get(l.mes);
    COMPONENTES.forEach((c, k) => {
      const de = 2 + k * 4;
      const calculado = r2(l[c.campo] * c.sinal);
      const grav = gravada ? r2(Number(gravada[c.campo]) * c.sinal) : 0;
      const ver = obra.versao_orcamento.get(`${c.origem}|${l.mes}`);
      const L = (j) => sheet.getColumn(de + j).letter;
      const cels = [
        { formula: `ROUND(${c.col}${rm}*${c.sinal},2)`, result: calculado },
        grav,
        ver === undefined ? null : ver,
        { formula: `${L(0)}${r}-${L(2)}${r}`, result: r2(calculado - (ver ?? 0)) },
      ];
      cels.forEach((v, j) => {
        const cel = row.getCell(de + j);
        cel.value = v;
        cel.numFmt = j === 3 ? '#,##0.00;[Red]-#,##0.00;"✓"' : FORMATOS.moeda;
        cel.font = { size: 9, color: { argb: j === 3 ? CORES.TEAL : CORES.CINZA_ESCURO } };
        if (j === 3) cel.alignment = { horizontal: 'center' };
        cel.border = { bottom: borda(), left: j === 0 ? borda(CORES.CINZA_LINHA) : undefined };
      });
    });
  });
  COMPONENTES.forEach((_, k) => {
    const L = sheet.getColumn(2 + k * 4 + 3).letter;
    sheet.addConditionalFormatting({
      ref: `${L}${PLOT0}:${L}${PLOTN}`,
      rules: [
        {
          type: 'expression',
          formulae: [`ABS(${L}${PLOT0})>=0.01`],
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: CORES.VERMELHO_CLARO } }, font: { bold: true, color: { argb: CORES.VERMELHO } } },
        },
      ],
    });
  });

  // ─── 4) Unidades do Geral ───────────────────────────────────────────────────────────────────
  faixa(sheet, UN_FAIXA, 'UNIDADES DO GERAL (contrato Caixa) — base do Novo Registro, da Medição e da Amortização', 1, 15);
  const UNID = [
    ['Unidade (contrato)', '0', ''],
    ['Assinatura', FORMATOS.data, ''],
    ['Registro (Geral)', FORMATOS.data, 'Vazio = não registrada'],
    ['Mês do registro', FORMATOS.mes, 'Registro ou assinatura + prazo'],
    ['Mutuário', null, ''],
    ['Terreno', FORMATOS.moeda, ''],
    ['FGTS', FORMATOS.moeda, ''],
    ['Financiamento', FORMATOS.moeda, ''],
    ['Subsídio', FORMATOS.moeda, ''],
    ['VGF medição', FORMATOS.moeda, '= Financiamento − Terreno + Subsídio'],
    ['% obra no registro', FORMATOS.pct, '% obra do mês do registro (0 fora do ciclo)'],
    ['À vista', FORMATOS.moeda, '= Terreno + FGTS'],
    ['Novo registro', FORMATOS.moeda, '= À vista + VGF medição × % obra'],
    ['Amortiza?', null, 'Não = assinada até a Data da DM'],
    ['Situação', null, ''],
  ];
  cabecalhoTabela(sheet, UN_CAB, UNID.map(([r]) => r));
  UNID.forEach(([, , regra], i) => {
    const c = sheet.getCell(UN_REGRA, i + 1);
    c.value = regra;
    c.font = { size: 8, italic: true, color: { argb: CORES.CINZA } };
    c.alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
    c.fill = preencher(CORES.CINZA_CLARO);
  });
  sheet.getRow(UN_REGRA).height = 26;
  const primeiroMes = linhas[0]?.mes;
  const ultimoMes = linhas[n - 1]?.mes;
  unidades.forEach((un, i) => {
    const r = UN0 + i;
    const c = porUnidade[i];
    const pctObra = c.regMes && mapa.has(c.regMes) ? mapa.get(c.regMes) : 0;
    const fora = c.regMes && (c.regMes < primeiroMes || c.regMes > ultimoMes);
    const situacao = `${un.data_registro ? 'Registrada' : un.data_assinatura ? 'Registro projetado' : 'Sem assinatura'}${fora ? ' · fora do ciclo' : ''}`;
    const valores = [
      /^\d+$/.test(un.contrato_unidade || '') ? Number(un.contrato_unidade) : un.contrato_unidade || '',
      dataExcel(un.data_assinatura),
      dataExcel(un.data_registro),
      {
        formula: `IF(C${r}<>"",DATE(YEAR(C${r}),MONTH(C${r}),1),IF(B${r}<>"",EDATE(DATE(YEAR(B${r}),MONTH(B${r}),1),${NOME('PRAZO')}),""))`,
        result: c.regMes ? dataExcel(c.regMes) : '',
      },
      un.nome_mutuario || '',
      Number(un.valor_terreno || 0),
      Number(un.valor_fgts || 0),
      Number(un.valor_financiamento || 0),
      Number(un.valor_subsidio || 0),
      { formula: `H${r}-F${r}+I${r}`, result: c.vgfMedicao },
      { formula: `IFERROR(INDEX(${memIntervalo('F')},MATCH(D${r},${memIntervalo('A')},0)),0)`, result: pctObra },
      { formula: `F${r}+G${r}`, result: Number(un.valor_terreno || 0) + Number(un.valor_fgts || 0) },
      { formula: `L${r}+J${r}*K${r}`, result: c.totalNovoRegistro },
      { formula: `IF(AND(B${r}<>"",B${r}<=${NOME('DM')}),"Não","Sim")`, result: c.statusDm ? 'Não' : 'Sim' },
      situacao,
    ];
    const row = sheet.getRow(r);
    valores.forEach((v, j) => {
      const cel = row.getCell(j + 1);
      cel.value = v;
      if (UNID[j][1]) cel.numFmt = UNID[j][1];
      cel.font = { size: 9, color: { argb: fora ? CORES.CINZA : CORES.CINZA_ESCURO }, bold: j === 12 };
      cel.border = { bottom: borda() };
      cel.alignment = { vertical: 'middle', horizontal: j === 4 || j >= 13 ? 'left' : 'center' };
      if (i % 2) cel.fill = preencher(CORES.CINZA_CLARO);
    });
  });
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 0, showGridLines: false }];
  impressao(sheet);
  return sheet;
};

module.exports.nomeAba = nomeAba;
