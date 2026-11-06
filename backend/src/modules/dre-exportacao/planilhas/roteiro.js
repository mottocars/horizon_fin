const { CORES, borda, preencher, dataExcel, dataHoraExcel, cabecalho, faixa, cabecalhoTabela, impressao } = require('../../../utils/excelMarca');
const { FMT, aba, rotuloCentro, rotuloMes, dataBr, dataHoraBr } = require('./comum');
const { MOTIVO } = require('./bases');

// Abas "Roteiro" (a primeira: conferências automáticas, alertas dos dados, o que ficou fora da DRE por
// motivo, como cada linha é calculada, o roteiro sugerido de auditoria e o índice das abas) e
// "Parâmetros" (configuração da DRE, máscaras e a regra de cada uma, alíquotas, centros, documentos
// fora da DRE e a atualização das fontes) da exportação de auditoria.

const NOMES = { roteiro: 'Roteiro', parametros: 'Parâmetros' };
const ORIGEM = {
  CONTRATOS_VENDAS: 'Sienge - Contratos de vendas',
  UNIDADES_IMOBILIARIAS: 'Sienge - Unidades imobiliárias',
  FINANCEIRO: 'Sienge - Financeiro CP/CR/Extrato',
  IMPOSTO_FIXO: 'Imposto fixo',
};
const CALCULO = {
  VALOR_VENDAS: 'Valor de vendas',
  ESTORNO_VENDAS: 'Estorno de vendas',
  RECEITA_DISTRATO: 'Receitas com distrato',
  ESTORNO_CUSTO: 'Estorno de custo',
  RECEITA_PERMUTA: 'Receita com permuta',
  ENTRADAS_SAIDAS: 'Entradas e saídas financeiras',
  CORRECAO_MONETARIA: 'Correção monetária',
};
const SIGNIFICADO = {
  [MOTIVO.DOCUMENTO]: 'O tipo de documento está marcado como fora da DRE na aba Configurações (ex.: previsões). Confira se a lista ainda vale.',
  [MOTIVO.SEM_CENTRO]: 'Lançamento sem centro de custo no Sienge: não tem como ir pra uma coluna da DRE.',
  [MOTIVO.CENTRO_SEM_CADASTRO]: 'O centro do lançamento não existe no cadastro de centros (sincronize os centros do Sienge).',
  [MOTIVO.CENTRO_SEM_DRE]: 'O centro não está com "Realiza DRE" na aba Centros Custos — se ele deveria estar na DRE, marque.',
  [MOTIVO.SEM_NATUREZA]: 'Lançamento sem natureza (plano financeiro) no Sienge.',
  [MOTIVO.NAO_ENTRA]: 'A natureza está como "NÃO ENTRA NA DRE" no plano que vale pro centro (receitas de venda entram pelos contratos; aportes, empréstimos, transferências etc. não são resultado).',
  [MOTIVO.SEM_MASCARA]: 'A natureza não tem Máscara DRE no plano do centro: classifique na aba Plano Contas — pode ser resultado esquecido.',
  [MOTIVO.MASCARA_SEM_FINANCEIRO]: 'A natureza aponta pra uma linha que calcula por contratos, unidades, correção ou imposto — o lançamento financeiro não entra.',
};

const ESTILO_NIVEL = {
  Atenção: { fill: CORES.VERMELHO_CLARO, cor: 'FFB91C1C' },
  Verificar: { fill: CORES.AMARELO_CLARO, cor: 'FF92400E' },
  Info: { fill: CORES.CINZA_CLARO, cor: CORES.CINZA_ESCURO },
};

// Alertas dos dados, calculados aqui (o que pode distorcer a DRE ou pede um olhar do auditor).
function alertas(d, L, J = null) {
  const lista = [];
  const add = (nivel, texto, qtd, valor, onde) => lista.push({ nivel, texto, qtd, valor, onde });
  const { m } = d;
  const soma = (xs, k) => xs.reduce((t, x) => t + (Number(x[k]) || 0), 0);

  if (!m.pocEm) add('Atenção', 'POC de Receita não configurada (aba Configurações): as receitas com POC ficam sem cálculo.', null, null, 'Parâmetros');
  if (!d.resultado.avaliacao_vertical) add('Info', 'Avaliação Vertical não configurada: a AV % fica vazia.', null, null, 'Parâmetros');
  const semCalculo = m.mascaras.filter((x) => d.regras.get(x.id).tipo === 'SEM_CALCULO');
  if (semCalculo.length) add('Atenção', `Linhas da DRE sem cálculo (traço na tela): ${semCalculo.map((x) => x.descricao).join(', ')}.`, semCalculo.length, null, 'Parâmetros › Máscaras');

  const ev = (e) => L.unidades.filter((u) => u.evento === e);
  const vendasSemData = ev('Venda').filter((u) => !u.data);
  if (vendasSemData.length)
    add('Atenção', 'Contratos de venda sem data: não entram na receita nem na POC de Despesa.', vendasSemData.length, soma(vendasSemData, 'venda'), 'Base Unidades (Evento = Venda, Data vazia)');
  const vendasSemValor = ev('Venda').filter((u) => u.venda === null);
  if (vendasSemValor.length) add('Verificar', 'Contratos de venda sem valor (entram com zero na receita).', vendasSemValor.length, null, 'Base Unidades');
  const semFracao = L.unidades.filter((u) => u.evento !== 'Estoque' && u.fracao === null);
  if (semFracao.length)
    add('Atenção', 'Unidades vendidas, permutadas ou distratadas sem fração ideal no Sienge: ficam fora da POC de Despesa (custo, comissão e legalização reconhecidos a menos).', semFracao.length, null, 'Base Unidades (Fração ideal vazia)');
  const permSemData = ev('Permuta').filter((u) => !u.data);
  if (permSemData.length)
    add('Verificar', 'Permutas sem data de avaliação: não entram na receita com permuta nem na POC de Despesa.', permSemData.length, soma(permSemData, 'permuta'), 'Base Unidades (Evento = Permuta)');
  const distSemData = ev('Distrato').filter((u) => !u.data);
  if (distSemData.length) add('Verificar', 'Distratos sem data de cancelamento: o estorno não entra.', distSemData.length, soma(distSemData, 'estorno'), 'Base Unidades (Evento = Distrato)');

  // Obras no fim do período.
  const estouradas = [];
  const semOrcamento = [];
  const acima100 = [];
  m.obras.forEach((c) => {
    const r = m.pocEm ? m.pocEm(c.id, d.ate) : null;
    if (r && r.orcamento > 0 && r.custo > r.orcamento) estouradas.push({ c, excesso: r.custo - r.orcamento });
    // Sem orçamento só pesa em obra (natureza OBRA) ou em centro com venda: a receita não é reconhecida.
    const temVenda = L.unidades.some((u) => u.centro_id === c.id && u.evento === 'Venda');
    const obra = d.centros.get(c.id)?.natureza === 'OBRA';
    if (r && r.orcamento <= 0 && ((obra && r.custo > 0) || temVenda)) semOrcamento.push({ c, custo: r.custo });
    if (m.pocDespesa(c.id, d.ate) > 1) acima100.push(c);
  });
  if (semOrcamento.length)
    add(
      'Atenção',
      `Obras com custo ou venda e SEM orçamento: POC de Receita = 0, a receita delas não é reconhecida (${semOrcamento.map((x) => x.c.rotulo).join(', ')}).`,
      semOrcamento.length,
      semOrcamento.reduce((t, x) => t + x.custo, 0),
      'POC (Orçamento vigente = 0) e Base Orçamento'
    );
  if (estouradas.length)
    add(
      'Verificar',
      `Obras com custo acima do orçamento: POC de Receita travada em 100% (${estouradas.map((x) => x.c.rotulo).join(', ')}). O valor é o excesso de custo — revise o orçamento.`,
      estouradas.length,
      estouradas.reduce((t, x) => t + x.excesso, 0),
      'POC (Custo acumulado > Orçamento vigente)'
    );
  if (acima100.length)
    add('Verificar', `POC de Despesa acima de 100% (frações vendidas + permutas > 1; o sistema não trava): ${acima100.map((c) => c.rotulo).join(', ')}.`, acima100.length, null, 'POC e Base Unidades');

  // Revisões de orçamento dentro do período (a POC muda de patamar no mês da revisão).
  const versoes = new Map();
  d.orcamento.forEach((o) => {
    if (!versoes.has(o.centro_id)) versoes.set(o.centro_id, new Set());
    versoes.get(o.centro_id).add(o.inicio);
  });
  const revisoes = [];
  versoes.forEach((vs, id) => {
    const lista2 = [...vs].sort();
    lista2.forEach((v, i) => {
      if (i > 0 && v >= d.de && v <= d.ate) revisoes.push(`${m.obras.find((c) => c.id === id)?.rotulo || id} em ${rotuloMes(v)}`);
    });
  });
  if (revisoes.length)
    add('Verificar', `Orçamento revisado dentro do período (a POC de Receita muda no mês da revisão e o reconhecido se ajusta de uma vez): ${revisoes.join('; ')}.`, revisoes.length, null, 'Base Orçamento e POC');

  // Ajustados / criados à mão: a quantidade é da base inteira (podem pesar pela POC acumulada); o valor,
  // só dos que caem no período.
  [
    ['Ajustado', 'ajustados no Horizon (centro, natureza ou valor trocados)'],
    ['Criado à mão', 'criados à mão no Horizon'],
  ].forEach(([status, rotulo]) => {
    const todos = L.financeiro.filter((f) => f.status === status);
    if (!todos.length) return;
    const doPeriodo = todos.filter((f) => f.periodo === 'Sim');
    add(
      'Verificar',
      `Lançamentos ${rotulo} na base da DRE: ${todos.length} desde o início, ${doPeriodo.length} no período${doPeriodo.length ? ' (o valor é o deles)' : ''}. Os anteriores pesam pela POC acumulada.`,
      todos.length,
      doPeriodo.length ? soma(doPeriodo, 'valor') : null,
      `Base Financeiro (Status = ${status})`
    );
  });

  const semMascara = L.fora.filter((f) => f.motivo === MOTIVO.SEM_MASCARA);
  if (semMascara.length)
    add('Atenção', 'Lançamentos do período com natureza SEM Máscara DRE (podem ser resultado esquecido).', semMascara.length, soma(semMascara, 'valor'), 'Fora da DRE (Motivo = Natureza sem Máscara DRE)');
  const semDre = L.fora.filter((f) => f.motivo === MOTIVO.CENTRO_SEM_DRE);
  if (semDre.length)
    add('Info', 'Lançamentos do período em centros sem "Realiza DRE" (ficam fora de propósito? confira).', semDre.length, soma(semDre, 'valor'), 'Fora da DRE (Motivo = Centro sem "Realiza DRE")');

  const emAberto = d.correcoes.filter((c) => c.vencimento >= d.de && c.vencimento <= d.ate);
  const totalAberto = soma(emAberto, 'em_aberto');
  if (Math.abs(totalAberto) > 0.005)
    add('Info', 'Correção monetária em aberto no período: é a foto de hoje (saldo corrigido − saldo) e muda até a parcela ser paga.', emAberto.filter((c) => c.em_aberto).length, totalAberto, 'Base Correções (Correção em aberto)');

  const hoje = new Date().toISOString().slice(0, 10);
  if (d.ate > hoje) add('Info', `O período vai até ${dataBr(d.ate)}, depois de hoje: os meses futuros só têm o que já foi lançado.`, null, null, '—');

  // Projeção (colunas Projetado / Desvio %).
  if (d.projecao) {
    const P = d.projecao;
    if (!P.orcamentos.length)
      add('Info', `Nenhum orçamento da projeção (${P.fonte === 'versao' ? (P.versao ? `Versão ${P.versao.numero}` : 'nenhuma versão salva') : 'rascunhos + última versão'}) nos centros desta DRE: sem colunas Projetado / Desvio %.`, null, null, 'aba Projeções da DRE Construtoras');
    const sem = m.obras.filter((c) => !P.orcamentos.some((o) => o.orc.centro_id === c.id));
    if (P.orcamentos.length && sem.length)
      add('Info', `Centros sem orçamento na projeção (Projetado com traço; o Desvio do consolidado compara só os com projeção): ${sem.map((c) => c.rotulo).join(', ')}.`, sem.length, null, 'Projeção');
    const andamento = P.orcamentos.filter((o) => o.orc.status !== 'CONCLUIDO');
    if (andamento.length)
      add('Verificar', `Rascunhos em andamento calculados na hora (ainda não concluídos, mudam a cada edição): ${andamento.map((o) => J?.centros.get(o.orc.centro_id)?.rotulo || o.orc.centro_id).join(', ')}.`, andamento.length, null, 'Projeção (Situação)');
    if (P.avisos.length) add('Atenção', `Orçamentos que não deu pra calcular (ficaram fora da projeção): ${P.avisos.join(' · ')}.`, P.avisos.length, null, 'Projeção');
    if (J) {
      const mudou = [...new Set(J.memoria.filter((x) => Math.abs(Number(x.dif) || 0) >= 0.01).map((x) => x.centro))];
      if (mudou.length)
        add('Verificar', `O realizado até a trava mudou depois que o orçamento foi concluído (lançamento com data antiga, ajuste, contrato): a Memória Projeção, refeita com o realizado de hoje, não bate com o gravado em ${mudou.join(', ')}. O Projetado da tela continua o gravado — conclua de novo e salve outra versão se quiser atualizar.`, mudou.length, null, 'Memória Projeção (coluna Diferença)');
      const fin = new Set(d.mascarasFin);
      const semOrigem = d.plano.filter((p) => J.centros.has(p.centro_id) && !p.nao_entra && p.mascara_id && fin.has(p.mascara_id) && !p.origem_projecao);
      if (semOrigem.length)
        add('Verificar', 'Naturezas das linhas do Financeiro SEM Origem Projeção no plano de contas de centros com projeção: não entram na projeção (nem digitadas, nem do Sienge).', semOrigem.length, null, 'Plano de Contas (Origem Projeção vazia)');
    }
  }
  return lista;
}

function tituloSecao(sheet, linha, texto, ultima) {
  faixa(sheet, linha, texto, 1, ultima);
  return linha + 1;
}

function escreverRoteiro(workbook, sheet, d, ctx, meta) {
  const { L, LY, C, dre } = ctx;
  const ULT = 6;
  [4, 52, 20, 18, 16, 70].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  cabecalho(workbook, sheet, {
    titulo: 'DRE Gerencial — dossiê de auditoria',
    subtitulo:
      'Tudo o que fez a DRE chegar em cada número: a DRE recalculada no Excel (fórmulas vivas) e conferida com o sistema, a memória de cálculo linha × centro × mês, as POCs e as bases linha a linha. Comece pelas conferências abaixo.',
    filtros: meta.filtros,
    gerado: meta.gerado,
    ultimaColuna: ULT,
  });
  let n = 6;
  const texto = (cel, v, extra = {}) => {
    cel.value = v;
    cel.font = { size: 9, color: { argb: CORES.CINZA_ESCURO }, ...extra };
    cel.alignment = { vertical: 'middle', wrapText: true };
  };
  // Altura da linha pelo texto mais longo: [texto, largura da coluna] (fonte 9 cabe ~1,15 caractere por unidade de largura).
  const altura = (...pares) => Math.max(18, Math.max(...pares.map(([t, w]) => Math.ceil(String(t ?? '').length / (w * 1.15)))) * 12 + 5);
  const linhaTabela = (valores, { formatos = [], altura } = {}) => {
    const row = sheet.getRow(n);
    valores.forEach((v, i) => {
      const cel = row.getCell(i + 1);
      texto(cel, v);
      if (formatos[i]) cel.numFmt = FMT[formatos[i]] || formatos[i];
      cel.border = { bottom: borda() };
    });
    if (altura) row.height = altura;
    n += 1;
    return row;
  };

  // 1. Conferências automáticas
  n = tituloSecao(sheet, n, '1. CONFERÊNCIAS AUTOMÁTICAS — fórmulas vivas: recalculam se você mexer nas bases', ULT);
  cabecalhoTabela(sheet, n, ['#', 'Conferência', 'Resultado', 'Esperado', 'Status', 'Onde olhar']);
  n += 1;
  const MU = C.lyMem.faixa('u');
  const POCdif = C.lyPoc.faixa('diferenca');
  const BF = LY.financeiro;
  const J = ctx.J;
  const inicioConf = n;
  const conf = [
    [
      'DRE: consolidado = soma dos centros, linha a linha (soma das diferenças absolutas)',
      { formula: `${aba('DRE')}!${dre.conferencia}`, result: 0 },
      'zero',
      `IF(ABS(C{n})<0.01,"OK","DIVERGENTE")`,
      'DRE, linha de conferência no rodapé',
    ],
    [
      'Memória de cálculo: cada linha × centro × mês, Excel × sistema',
      { formula: `SUMIF(${MU},">0")-SUMIF(${MU},"<0")`, result: 0 },
      'zero',
      `IF(AND(ABS(C{n})<0.01,COUNTIF(${MU},"≠")=0),"OK","DIVERGENTE")`,
      'Memória de Cálculo, coluna Diferença (filtre ≠ 0)',
    ],
    [
      'POC de Receita, POC de Despesa e fração distratada: Excel × sistema (maior diferença)',
      { formula: `MAX(${POCdif})`, result: 0 },
      'zero',
      `IF(C{n}<=0.000001,"OK","DIVERGENTE")`,
      'POC, coluna Maior diferença',
    ],
    // Projeção: a conta refeita hoje (realizado de hoje + premissas gravadas) × o que foi gravado.
    ...(J && J.memoria.length
      ? [
          [
            'Projeção: Memória Projeção refeita hoje × gravado no orçamento (soma das diferenças absolutas)',
            { formula: `SUMIF(${J.lyMem.faixa('dif')},">0")-SUMIF(${J.lyMem.faixa('dif')},"<0")`, result: J.somaDiferencas },
            'zero',
            `IF(AND(ABS(C{n})<0.01,COUNTIF(${J.lyMem.faixa('dif')},"≠")=0),"OK","MUDOU")`,
            'Memória Projeção, coluna Diferença (MUDOU = o realizado até a trava mudou depois que o orçamento foi concluído)',
          ],
          [
            'Projeção: POC refeita × POC gravada no orçamento (maior diferença)',
            { formula: `MAX(${J.lyPoc.faixa('diferenca')})`, result: J.maiorDiferencaPoc },
            'zero',
            `IF(C{n}<=0.000001,"OK","MUDOU")`,
            'POC Projeção, coluna Maior diferença',
          ],
        ]
      : []),
  ];
  conf.forEach(([t, res, esp, status, onde], i) => {
    const row = linhaTabela([i + 1, t, res, esp, { formula: status.replace(/\{n\}/g, n), result: 'OK' }, onde], { altura: 26 });
    row.getCell(3).numFmt = i === 2 || i === 4 ? '0.00000000' : FMT.moeda;
    row.getCell(5).font = { bold: true, size: 10 };
    row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  });
  sheet.addConditionalFormatting({
    ref: `E${inicioConf}:E${n - 1}`,
    rules: [
      { type: 'expression', formulae: [`E${inicioConf}="OK"`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD1FAE5' } }, font: { color: { argb: 'FF047857' } } } },
      { type: 'expression', formulae: [`E${inicioConf}="MUDOU"`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: CORES.AMARELO_CLARO } }, font: { color: { argb: 'FF92400E' } } } },
      { type: 'expression', formulae: [`AND(E${inicioConf}<>"OK",E${inicioConf}<>"MUDOU")`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: CORES.VERMELHO_CLARO } }, font: { color: { argb: 'FFB91C1C' } } } },
    ],
  });
  // Números de contexto (também fórmulas).
  const info = [
    ['Lançamentos na base da DRE (desde o primeiro até o fim do período)', { formula: `COUNTA(${BF.faixa('data')})`, result: L.financeiro.length }, 'int', 'Base Financeiro'],
    [
      'Valor lançado no período nas linhas do Financeiro',
      { formula: `SUMIFS(${BF.faixa('valor')},${BF.faixa('periodo')},"Sim")`, result: L.financeiro.filter((f) => f.periodo === 'Sim').reduce((t, f) => t + f.valor, 0) },
      'moeda',
      'Base Financeiro (No período? = Sim)',
    ],
    ['Lançamentos ajustados no Horizon (na base)', { formula: `COUNTIFS(${BF.faixa('status')},"Ajustado")`, result: L.financeiro.filter((f) => f.status === 'Ajustado').length }, 'int', 'Base Financeiro (Status)'],
    ['Lançamentos criados à mão (na base)', { formula: `COUNTIFS(${BF.faixa('status')},"Criado à mão")`, result: L.financeiro.filter((f) => f.status === 'Criado à mão').length }, 'int', 'Base Financeiro (Status)'],
    ['Lançamentos do período que ficaram fora da DRE', { formula: `COUNTA(${LY.fora.faixa('motivo')})`, result: L.fora.length }, 'int', 'Fora da DRE'],
  ];
  info.forEach(([t, res, fmt, onde], i) => {
    const row = linhaTabela([conf.length + i + 1, t, res, '', 'informativo', onde]);
    row.getCell(3).numFmt = FMT[fmt];
    row.getCell(5).font = { size: 9, italic: true, color: { argb: CORES.CINZA } };
    row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  });
  n += 1;

  // 2. Alertas
  n = tituloSecao(sheet, n, '2. ALERTAS DOS DADOS — o que pode distorcer a DRE ou merece um olhar antes de entregar', ULT);
  cabecalhoTabela(sheet, n, ['', 'Alerta', 'Quantidade', 'Valor', 'Nível', 'Onde conferir']);
  n += 1;
  const lista = alertas(d, L, J);
  if (!lista.length) linhaTabela(['', 'Nenhum alerta: os dados não mostram nada fora do padrão.', '', '', 'OK', '']);
  lista.forEach((a) => {
    const row = linhaTabela(['', a.texto, a.qtd, a.valor, a.nivel, a.onde], { formatos: [null, null, 'int', 'moeda'], altura: altura([a.texto, 52], [a.onde, 70]) });
    const e = ESTILO_NIVEL[a.nivel];
    row.getCell(5).fill = preencher(e.fill);
    row.getCell(5).font = { bold: true, size: 9, color: { argb: e.cor } };
    row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  });
  n += 1;

  // 3. Fora da DRE por motivo
  n = tituloSecao(sheet, n, '3. O QUE FICOU FORA DA DRE NO PERÍODO, POR MOTIVO — teste de completude', ULT);
  cabecalhoTabela(sheet, n, ['', 'Motivo', 'Lançamentos', 'Valor', '', 'O que significa / o que fazer']);
  n += 1;
  const FM = LY.fora.faixa('motivo');
  const FV = LY.fora.faixa('valor');
  Object.values(MOTIVO).forEach((mot) => {
    const doMotivo = L.fora.filter((f) => f.motivo === mot);
    const row = linhaTabela(
      [
        '',
        mot,
        { formula: `COUNTIFS(${FM},B${n})`, result: doMotivo.length },
        { formula: `SUMIFS(${FV},${FM},B${n})`, result: doMotivo.reduce((t, f) => t + f.valor, 0) },
        '',
        SIGNIFICADO[mot],
      ],
      { formatos: [null, null, 'int', 'moeda'], altura: altura([mot, 52], [SIGNIFICADO[mot], 70]) }
    );
    if (!doMotivo.length) row.eachCell((c) => (c.font = { ...c.font, color: { argb: CORES.CINZA } }));
  });
  n += 1;

  // 4. Como a DRE é calculada
  n = tituloSecao(sheet, n, '4. COMO CADA LINHA DA DRE É CALCULADA', ULT);
  const regras = [
    ['Princípio', 'Cada linha é reconhecida pelo ACUMULADO: valor no mês = base acumulada até o fim do mês × fator no fim − base acumulada até a véspera × fator na véspera. Assim o mês desconta o que já foi reconhecido antes (venda antiga entra pelo avanço da obra; venda nova, com todo o avanço já feito).'],
    ['POC de Receita', `Custo acumulado da obra na máscara "${d.m.mascaraPoc?.descricao || '—'}" ÷ orçamento vigente (a versão de início mais recente), até 100%, com 6 casas no percentual. Multiplica vendas, permutas, correção monetária e estorno de vendas.`],
    ['POC de Despesa', 'Fração ideal vendida (todo contrato, até o cancelado depois, × participação da unidade) + fração em permuta. Multiplica o custo dos imóveis (CIV) e, descontada a fração distratada, comissão e legalização.'],
    ['Estorno de custo', '−(custos do grupo do CIV acumulados) × fração distratada: devolve o custo das unidades distratadas.'],
    ['Sem POC', 'As despesas sem "% POC" entram pelo valor lançado no mês (emissão do título; no extrato, a data do movimento). A receita com distrato, pelo recebido − devolvido na data do distrato.'],
    ['RET (imposto fixo)', '−alíquota vigente no mês × soma de todas as linhas acima dele na DRE, centro a centro, mês a mês.'],
    ['Grupos e totais', 'Grupo de nível 1 = soma das linhas dele; totalizadora (=) = soma de todas as linhas acima. Consolidado = soma dos centros.'],
    ['Base Financeiro', 'Títulos a receber (valor líquido de impostos retidos) e a pagar pela EMISSÃO, movimentos do extrato sem título pela data, lançamentos criados à mão — rateados por centro × natureza, com os ajustes do Horizon, só centros com "Realiza DRE", naturezas com Máscara DRE e documentos que não estão fora da DRE.'],
    ...(J
      ? [
          ['Projetado', 'A DRE do orçamento do centro mês a mês, gravada ao concluir (Projeção Mensal): até o mês da trava, o realizado daquela data; depois, o projetado — o mesmo motor, com as premissas (vendas das unidades em estoque, naturezas pela Origem Projeção, correção digitada) somadas ao realizado até a trava. Abra em Memória Projeção.'],
          ['Desvio %', '(Valor − Projetado) ÷ |Projetado|: realizado até hoje contra o projetado só dos meses até o atual (o mês inteiro); no consolidado, o realizado só dos centros com projeção. Positivo = melhor que o projetado (receita maior ou custo menor).'],
        ]
      : []),
  ];
  regras.forEach(([t, x]) => {
    const row = sheet.getRow(n);
    texto(row.getCell(2), t, { bold: true, color: { argb: CORES.AZUL_ESCURO } });
    sheet.mergeCells(n, 3, n, ULT);
    texto(row.getCell(3), x);
    row.height = altura([x, 124]);
    n += 1;
  });
  n += 1;

  // 5. Roteiro sugerido
  n = tituloSecao(sheet, n, '5. ROTEIRO SUGERIDO DE AUDITORIA', ULT);
  const passos = [
    'Confira as conferências da seção 1: as da DRE realizada precisam estar OK (as da projeção podem dar MUDOU: o realizado até a trava mudou depois do orçamento). Se alguma divergir, filtre a coluna Diferença da aba indicada.',
    'Leia os alertas da seção 2 e resolva os de nível Atenção antes de entregar (obra sem orçamento, unidade sem fração ideal, natureza sem máscara).',
    'Na aba DRE, escolha as linhas mais relevantes e abra cada uma na Memória de Cálculo (filtre Linha DRE e Centro): o TOTAL DO FILTRO dá o número da DRE.',
    'Na Memória, confira base × fator. Para a base, filtre a aba Base indicada pela linha (Base Financeiro: Id linha + Centro; Base Unidades/Correções: Centro) e veja os lançamentos que a compõem.',
    'Na aba POC, confira o orçamento vigente (Base Orçamento) e o custo acumulado de cada obra; a POC de Despesa vem das frações da Base Unidades.',
    'Valide a classificação: aba Plano de Contas (natureza → linha em cada centro) e os lançamentos Ajustados / Criados à mão da Base Financeiro (quem fez, quando e por quê).',
    'Faça o teste de completude na aba Fora da DRE: tudo o que ficou de fora no período tem um motivo — confira os maiores valores de cada motivo (seção 3).',
    'Use a DRE Mensal pra olhar a tendência de cada centro e achar meses fora da curva.',
    ...(J
      ? [
          'Projeção: na aba Projeção veja a versão e cada orçamento (trava, ciclo, quem concluiu); um Projetado se abre na Memória Projeção (base realizada até a trava + premissas × fator) e os insumos estão na POC Projeção e na Premissas Projeção. Desvio grande: compare a premissa (venda, custo digitado, orçamento empresarial) com o realizado do mês.',
        ]
      : []),
  ];
  passos.forEach((p, i) => {
    const row = sheet.getRow(n);
    texto(row.getCell(1), i + 1, { bold: true });
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
    sheet.mergeCells(n, 2, n, ULT);
    texto(row.getCell(2), p);
    row.height = altura([p, 176]);
    n += 1;
  });
  n += 1;

  // 6. Abas
  n = tituloSecao(sheet, n, '6. ABAS DESTE ARQUIVO', ULT);
  const abas = [
    ['DRE', 'A DRE como na tela (consolidado e centros: Valor, AV % e, com projeção, Projetado e Desvio %), recalculada em fórmulas.'],
    ['DRE Mensal', 'A DRE mês a mês do consolidado ou de um centro (escolha na célula C6).'],
    ['Memória de Cálculo', 'Cada linha × centro × mês: base acumulada, fator, reconhecido e o valor do mês, com o valor do sistema ao lado.'],
    ['POC', 'Cada obra em cada ponto: orçamento, custo, POC de Receita, frações e POC de Despesa — em fórmulas, conferidas com o sistema.'],
    ['Base Financeiro', 'Os lançamentos das linhas que calculam pelo Financeiro, um a um, com rateio, ajustes e quem ajustou.'],
    ['Base Unidades', 'Contratos (vendas), distratos, permutas e estoque, com valores e frações ideais.'],
    ['Base Correções', 'Correção monetária das parcelas a receber (paga, reparcelada, em aberto).'],
    ['Base Orçamento', 'As versões do orçamento de cada obra, por categoria.'],
    ['Plano de Contas', 'A classificação de cada natureza em cada centro (Global ou próprio) e quanto dela está na base.'],
    ['Fora da DRE', 'Os lançamentos do período que não entraram, com o motivo.'],
    ['Parâmetros', 'Configuração da DRE, máscaras e regras, alíquotas, centros, documentos fora da DRE e atualização das fontes.'],
    ...(J
      ? [
          ['Projeção', 'O dossiê da projeção: versão, orçamentos (ciclo, trava, quem concluiu), totais do ciclo, premissas por origem e as regras.'],
          ['Projeção Mensal', 'A DRE de cada orçamento mês a mês como foi gravada — o que as colunas Projetado / Desvio % somam.'],
          ['Memória Projeção', 'Os meses projetados refeitos em fórmulas: realizado até a trava + premissas, × fator; com o gravado ao lado.'],
          ['POC Projeção', 'POC de Receita / Despesa de cada centro em cada mês projetado, em fórmulas, com as gravadas ao lado.'],
          ['Premissas Projeção', 'Vendas projetadas, naturezas por Origem Projeção e correção monetária, linha a linha.'],
        ]
      : []),
  ];
  abas.forEach(([nome, desc]) => {
    const row = sheet.getRow(n);
    const c = row.getCell(2);
    c.value = { text: nome, hyperlink: `#${aba(nome)}!A1` };
    c.font = { size: 10, bold: true, underline: true, color: { argb: CORES.AZUL } };
    sheet.mergeCells(n, 3, n, ULT);
    texto(row.getCell(3), desc);
    row.height = 16;
    n += 1;
  });

  sheet.views = [{ showGridLines: false }];
  impressao(sheet);
}

function escreverParametros(workbook, sheet, d, ctx, meta) {
  const { m, resultado, extras } = d;
  const ULT = 10;
  [8, 30, 16, 34, 26, 24, 12, 12, 52, 8].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  cabecalho(workbook, sheet, {
    titulo: 'Parâmetros da DRE',
    subtitulo: 'A configuração que valeu nesta exportação: máscaras e a regra de cada linha, alíquotas, centros de custo, documentos fora da DRE e quando cada fonte foi atualizada.',
    filtros: meta.filtros,
    gerado: meta.gerado,
    ultimaColuna: ULT,
  });
  let n = 6;
  const cel = (r, c, v, extra = {}) => {
    const x = sheet.getCell(r, c);
    x.value = v;
    x.font = { size: 9, color: { argb: CORES.CINZA_ESCURO }, ...extra };
    x.alignment = { vertical: 'middle', wrapText: true };
    x.border = { bottom: borda() };
    return x;
  };

  n = tituloSecao(sheet, n, 'CONFIGURAÇÃO', ULT);
  const cfg = [
    ['Máscara da POC de Receita (custo da obra)', m.mascaraPoc?.descricao || 'não configurada'],
    ['Avaliação Vertical (100% =)', resultado.avaliacao_vertical?.descricao || 'não configurada'],
    ['Arredondamento da POC', '6 casas decimais no percentual (8 na fração), como no sistema'],
    ['Centros na DRE', d.filtrado ? 'os do filtro' : 'todos com "Realiza DRE" (aba Centros Custos)'],
  ];
  cfg.forEach(([k, v]) => {
    cel(n, 2, k, { bold: true });
    sheet.mergeCells(n, 3, n, ULT);
    cel(n, 3, v);
    n += 1;
  });
  n += 1;

  n = tituloSecao(sheet, n, 'MÁSCARAS DA DRE E A REGRA DE CADA LINHA', ULT);
  cabecalhoTabela(sheet, n, ['Ordem', 'Grupo (nível 1)', 'Totaliza?', 'Linha (nível 2)', 'Origem', 'Cálculo', '% POC', 'Tipo POC', 'Regra aplicada nesta DRE', 'Id']);
  n += 1;
  let ordem = 0;
  d.arvore.forEach((g) => {
    if (g.totalizadora || !g.filhos.length) {
      cel(n, 2, g.descricao, { bold: true });
      cel(n, 3, g.totalizadora ? 'Sim' : 'Não');
      cel(n, 9, g.totalizadora ? 'Soma de todas as linhas acima' : 'Grupo sem linhas');
      cel(n, 10, g.id);
      n += 1;
      return;
    }
    g.filhos.forEach((f) => {
      ordem += 1;
      const r = d.regras.get(f.id);
      cel(n, 1, ordem);
      cel(n, 2, g.descricao, { bold: true });
      cel(n, 3, 'Não');
      cel(n, 4, f.descricao);
      cel(n, 5, ORIGEM[f.origem] || f.origem || '—');
      cel(n, 6, CALCULO[f.calculo] || f.calculo || '—');
      cel(n, 7, f.realiza_poc ? 'Sim' : 'Não');
      cel(n, 8, f.tipo_poc ? (f.tipo_poc === 'RECEITA' ? 'Receita' : 'Despesa') : '—');
      cel(n, 9, r?.texto || '—');
      cel(n, 10, f.id);
      sheet.getRow(n).height = 26;
      n += 1;
    });
  });
  n += 1;

  n = tituloSecao(sheet, n, 'ALÍQUOTAS DO IMPOSTO FIXO (HISTÓRICO)', ULT);
  cabecalhoTabela(sheet, n, ['', 'Linha', 'Início', 'Alíquota']);
  n += 1;
  const nomes = new Map(m.mascaras.map((x) => [x.id, x.descricao]));
  if (!m.aliquotas.length) {
    cel(n, 2, 'Nenhuma alíquota cadastrada.');
    n += 1;
  }
  m.aliquotas.forEach((h) => {
    cel(n, 2, nomes.get(h.mascara_id) || h.mascara_id);
    const c = cel(n, 3, dataExcel(h.inicio));
    c.numFmt = FMT.mes;
    const a = cel(n, 4, Number(h.aliquota) / 100);
    a.numFmt = '0.00%';
    n += 1;
  });
  n += 1;

  n = tituloSecao(sheet, n, 'CENTROS DE CUSTO NESTA DRE (na ordem da aba Centros Custos)', ULT);
  cabecalhoTabela(sheet, n, ['Id', 'Centro (rótulo)', 'Natureza', 'Nome no Sienge', 'Plano de contas', 'Orçamento vigente no fim', 'POC Receita no fim', 'POC Despesa no fim', 'Fração distratada no fim', '']);
  n += 1;
  m.obras.forEach((c) => {
    const info = d.centros.get(c.id) || {};
    const r = m.pocEm ? m.pocEm(c.id, d.ate) : null;
    cel(n, 1, c.id);
    cel(n, 2, rotuloCentro(c));
    cel(n, 3, info.natureza || '—');
    cel(n, 4, info.nome || c.nome);
    cel(n, 5, info.plano_proprio ? 'Próprio do centro' : 'Global');
    cel(n, 6, r ? r.orcamento : null).numFmt = FMT.moeda;
    cel(n, 7, r ? r.poc : null).numFmt = FMT.poc;
    cel(n, 8, m.pocDespesa(c.id, d.ate)).numFmt = FMT.poc;
    cel(n, 9, m.fracaoDistratada(c.id, d.ate)).numFmt = FMT.poc;
    n += 1;
  });
  n += 1;

  n = tituloSecao(sheet, n, 'TIPOS DE DOCUMENTO FORA DA DRE (aba Configurações)', ULT);
  cabecalhoTabela(sheet, n, ['', 'Documento', 'Sigla', 'Marcado por', 'Em']);
  n += 1;
  const nomesDoc = new Map((extras.nomes_documentos || []).map((x) => [x.documento, x.nome]));
  const fora = extras.documentos_fora || [];
  if (!fora.length) {
    cel(n, 2, 'Nenhum: todo tipo de documento entra.');
    n += 1;
  }
  fora.forEach((x) => {
    cel(n, 2, nomesDoc.get(x.documento) || x.documento);
    cel(n, 3, x.documento);
    cel(n, 4, x.por || '—');
    cel(n, 5, dataHoraBr(`${x.em}`.endsWith('Z') ? x.em : `${x.em}-03:00`));
    n += 1;
  });
  n += 1;

  n = tituloSecao(sheet, n, 'ATUALIZAÇÃO DAS FONTES (última sincronização com o Sienge)', ULT);
  [
    ['Contas a receber', extras.receber],
    ['Contas a pagar', extras.pagar],
    ['Extrato das contas', extras.extrato],
    ['Contratos de venda', extras.contratos],
    ['Unidades', extras.unidades],
  ].forEach(([k, v]) => {
    cel(n, 2, k, { bold: true });
    const c = cel(n, 3, v ? dataHoraExcel(v) : '—');
    if (v) c.numFmt = FMT.dataHora;
    sheet.mergeCells(n, 3, n, 4);
    n += 1;
  });

  sheet.views = [{ showGridLines: false }];
  impressao(sheet);
}

module.exports = { NOMES, escreverRoteiro, escreverParametros, alertas };
