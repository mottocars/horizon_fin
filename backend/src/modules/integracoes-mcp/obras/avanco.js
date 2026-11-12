const { ferramenta } = require('../dfc/tools/comum');
const { z, falha, dataSchema, VISAO, br, pc, carregar, resolverObra, resolverObras, etapaTexto, colunaAvanco, avanco } = require('./base');

// obras_avanco e obras_curvas — a tela Obra 360º › Avanço das Obras. As contas são as da tela e do
// Excel (dfc-avancos/avancoObras.js): cards = realizado acumulado até hoje × previsto acumulado no fim
// do período da visão; finalizadas = todas as curvas que a obra tem com o realizado em 100%; "Abaixo do
// previsto" = realizado 0,05 p.p. ou mais abaixo.

const REFERENCIA = {
  mensal: (h, f) => `Realizado acumulado até hoje (${br(h)}) × previsto acumulado até o fim do mês (${br(f)})`,
  semanal: (h, f) => `Realizado acumulado até hoje (${br(h)}) × previsto acumulado até o fim da semana (sábado, ${br(f)})`,
  diaria: (h) => `Realizado e previsto acumulados até hoje (${br(h)})`,
};

// A linha de uma obra: os três cards e as comparações que interessam ao dono.
function linhaAvanco(o) {
  const c = o.cards;
  const pls = c.pls?.realizado ?? null;
  const obra = c.primaria?.realizado ?? null;
  const curvaPls = c.secundaria?.realizado ?? null;
  return {
    id: o.id,
    obra: o.nome,
    etapa_hoje: etapaTexto(o),
    pls_caixa: c.pls ? { realizado: pc(pls), medido_ate: br(o.curva.pls.ultima_liberacao) } : 'sem Caixa (sem contrato ou DCD não importado)',
    curva_s_de_obras: c.primaria ? colunaAvanco(c.primaria) : 'sem orçamento no Prevision',
    curva_s_pls: c.secundaria ? colunaAvanco(c.secundaria) : 'sem orçamento no Prevision',
    // Positivo: a Caixa mediu MAIS que a obra executou / que a curva registrada; negativo: mediu menos.
    pls_caixa_menos_curva_s_de_obras_pp: pls !== null && obra !== null ? pc(pls - obra) : null,
    pls_caixa_menos_curva_s_pls_pp: pls !== null && curvaPls !== null ? pc(pls - curvaPls) : null,
    idp_prevision: o.prevision.obras?.idp != null ? Number(o.prevision.obras.idp) : null,
    ultima_medicao_prevision: br(o.prevision.obras?.last_measurement || o.prevision.pls?.last_measurement),
    finalizada: c.finalizada || undefined,
  };
}

const avancoTool = {
  name: 'obras_avanco',
  description:
    'A tela Obra 360º › Avanço das Obras: para cada obra com Prevision, os três avanços acumulados lado a lado — PLS (Caixa: o avanço medido pela Caixa Econômica Federal ' +
    'na Planilha de Levantamento de Serviços, só realizado, com a data da última parcela liberada), Curva S de Obras (Prevision, orçamento primário: o avanço REAL da obra) e ' +
    'Curva S PLS (Prevision, orçamento secundário: a curva da PLS que a empresa registrou no Prevision) — com realizado × previsto, desvio em pontos percentuais e a situação ' +
    '("Abaixo do previsto" / "Em dia"); as diferenças PLS Caixa − Curva S de Obras e PLS Caixa − Curva S PLS; o IDP e a última medição do Prevision; e as obras finalizadas ' +
    '(todas as curvas em 100%) no fim. visao (mensal | semanal | diaria) muda a data do PREVISTO: fim do mês, sábado da semana ou hoje (o realizado é sempre até hoje). ' +
    'ordenar: nome (padrão, como a tela) | desvio (mais atrasadas na Curva S de Obras primeiro) | caixa (maior diferença PLS Caixa × obra real). Série por período: obras_curvas.',
  inputSchema: {
    visao: VISAO.optional().describe('mensal (padrão) | semanal | diaria — a data do previsto dos cards.'),
    obras: z.array(z.string()).optional().describe('Obras (código, apelido ou nome). Vazio = todas.'),
    ordenar: z.enum(['nome', 'desvio', 'caixa']).optional(),
    incluir_finalizadas: z.boolean().optional().describe('false = sem as finalizadas. Padrão: true (no fim, como a tela).'),
  },
  handler: ferramenta(async (empresaId, args) => {
    const visao = args.visao || 'mensal';
    const d = await carregar(empresaId, { visao });
    const marcadas = resolverObras(d.obras, args.obras);
    let lista = d.obras.filter((o) => o.cards && (!marcadas || marcadas.some((m) => m.id === o.id)));
    if (!lista.length) throw falha('Nenhuma obra com Prevision no filtro (o Avanço das Obras só mostra obras com orçamento no Prevision).');
    const andamento = lista.filter((o) => !o.cards.finalizada);
    const finalizadas = lista.filter((o) => o.cards.finalizada);
    const ordem = {
      nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
      desvio: (a, b) => (colunaAvanco(a.cards.primaria)?.desvio_pp ?? 0) - (colunaAvanco(b.cards.primaria)?.desvio_pp ?? 0),
      caixa: (a, b) => {
        const g = (o) => (o.cards.pls && o.cards.primaria ? Math.abs((o.cards.pls.realizado ?? 0) - (o.cards.primaria.realizado ?? 0)) : -1);
        return g(b) - g(a);
      },
    }[args.ordenar || 'nome'];
    andamento.sort(ordem);
    finalizadas.sort(ordem);
    lista = args.incluir_finalizadas === false ? andamento : [...andamento, ...finalizadas];
    const abaixo = (chave) => andamento.filter((o) => colunaAvanco(o.cards[chave])?.situacao === 'Abaixo do previsto').map((o) => o.nome);
    return {
      empresa: d.empresa,
      visao,
      referencia: REFERENCIA[visao](d.hoje, d.fimPeriodo),
      resumo: {
        obras_em_andamento: andamento.length,
        obras_finalizadas: finalizadas.map((o) => o.nome),
        abaixo_do_previsto_curva_s_de_obras: abaixo('primaria'),
        abaixo_do_previsto_curva_s_pls: abaixo('secundaria'),
        sem_pls_da_caixa: andamento.filter((o) => !o.cards.pls).map((o) => o.nome),
      },
      obras: lista.map(linhaAvanco),
      leitura:
        'PLS Caixa − Curva S de Obras negativo = a obra executou mais do que a Caixa já mediu (há avanço físico ainda não liberado pela Caixa); positivo = a Caixa ' +
        'mediu à frente da obra real. PLS Caixa − Curva S PLS = diferença entre o que a Caixa mediu e a curva da PLS registrada no Prevision.',
    };
  }),
};

const CHAVE = { pls: 'pls', curva_s_de_obras: 'primaria', curva_s_pls: 'secundaria' };
const LIMITE_PERIODOS = 400;

const curvasTool = {
  name: 'obras_curvas',
  description:
    'Os gráficos do Avanço das Obras em números (o mesmo empilhado do Excel da tela): para uma obra, cada curva — PLS (Caixa), Curva S de Obras e Curva S PLS — ' +
    'período a período na visão mensal, semanal (domingo a sábado) ou diária, com previsto e realizado ACUMULADOS no fim do período, o avanço DO PRÓPRIO período, o desvio ' +
    '(p.p.) e a situação. Sem de/ate, a obra inteira (do período antes do primeiro avanço até o previsto chegar a 100%); com de/ate, o recorte sem passar do fim da obra. ' +
    'O realizado para em hoje (períodos futuros vêm sem realizado). Na visão diária, informe de/ate (no máximo 400 períodos).',
  inputSchema: {
    obra: z.string().describe('Código do centro de custo, apelido ou nome.'),
    visao: VISAO.optional().describe('mensal (padrão) | semanal | diaria.'),
    de: dataSchema.optional(),
    ate: dataSchema.optional(),
    curvas: z.array(z.enum(['pls', 'curva_s_de_obras', 'curva_s_pls'])).optional().describe('Vazio = as três.'),
  },
  handler: ferramenta(async (empresaId, args) => {
    const visao = args.visao || 'mensal';
    const d = await carregar(empresaId, { visao });
    const o = resolverObra(d.obras, args.obra);
    if (!o.curva) throw falha(`${o.nome} não tem orçamento no Prevision — não aparece no Avanço das Obras.`);
    let [de, ate] = [args.de || '', args.ate || ''];
    if (de && ate && de > ate) [de, ate] = [ate, de];
    const periodos = avanco.periodosDaObra(o.curva, { visao, de, ate, hoje: d.hoje });
    if (periodos.length > LIMITE_PERIODOS)
      throw falha(`São ${periodos.length} períodos na visão ${visao} — informe de/ate menores (no máximo ${LIMITE_PERIODOS}) ou use a visão semanal/mensal.`);
    const pedidas = (args.curvas?.length ? args.curvas : Object.keys(CHAVE)).map((k) => CHAVE[k]);
    const curvas = avanco.CURVAS.filter((c) => pedidas.includes(c.chave)).map((c) => {
      const linhas = avanco.linhasDaCurva(o.curva, c.chave, periodos, { visao, hoje: d.hoje });
      return {
        curva: c.rotulo,
        linhas: linhas
          ? linhas.map((l) => ({
              periodo: l.periodo,
              // O PLS (Caixa) não tem previsto: sem os campos vazios.
              ...(c.chave === 'pls' ? {} : { previsto_acumulado: pc(l.previstoAcumulado) }),
              realizado_acumulado: pc(l.realizadoAcumulado),
              ...(c.chave === 'pls' ? {} : { desvio_pp: pc(l.desvio), previsto_no_periodo: pc(l.previstoNoPeriodo) }),
              realizado_no_periodo: pc(l.realizadoNoPeriodo),
              situacao: l.situacao || undefined,
              hoje: l.hoje || undefined,
            }))
          : 'a obra não tem esta curva',
      };
    });
    return {
      empresa: d.empresa,
      obra: `${o.nome} (${o.id})`,
      visao,
      recorte: `${periodos[0] ? br(periodos[0].ini) : '–'} a ${periodos.at(-1) ? br(periodos.at(-1).fim) : '–'}${de || ate ? ' (De/Até pedido, sem passar do fim da obra)' : ' (obra inteira)'}`,
      observacao: 'Percentuais acumulados com duas casas; o PLS (Caixa) não tem previsto. Períodos depois de hoje vêm sem realizado.',
      curvas,
    };
  }),
};

module.exports = { avancoTool, curvasTool, linhaAvanco };
