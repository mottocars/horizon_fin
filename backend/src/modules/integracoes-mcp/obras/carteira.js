const { ferramenta } = require('../dfc/tools/comum');
const { z, falha, dataSchema, br, brl, pc, carregar, resolverObras, localidade, etapaTexto } = require('./base');

// obras_carteira — a tela Obra 360º › Carteira de obras: os cards (VGV total e unidades; por etapa, as
// obras que estiveram nela no período, o VGV e as unidades delas, as "a iniciar" na etapa por onde
// começam e, na etapa da construção, as obras em atraso hoje) e a lista das obras com a etapa de hoje.
// Mesmas regras da tela (frontend: Operacoes/CronogramasObras/cronogramaObras.js — resumoCarteira,
// naRecorte, filtrarPeriodo): só entram as obras com alguma data de etapa; o período De/Até vale só
// pelo mês e pelo ano (padrão: 3 meses antes do atual a 20 à frente — o "Mês a mês" da tela); sem
// período ("Visão geral"), o cronograma inteiro.

const mesesDoPeriodo = (hoje) => {
  const [a, m] = hoje.split('-').map(Number);
  const ini = new Date(Date.UTC(a, m - 1 - 3, 1));
  const fim = new Date(Date.UTC(a, m - 1 + 21, 0));
  return { ini: ini.toISOString().slice(0, 7), fim: fim.toISOString().slice(0, 7) };
};
const noPeriodo = (s, periodo) => {
  const de = `${periodo.ini}-01`;
  const [a, m] = periodo.fim.split('-').map(Number);
  const ate = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  return s.inicio <= ate && (s.fim || s.inicio) >= de;
};
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesAno = (am) => `${MES[Number(am.slice(5, 7)) - 1]}/${am.slice(0, 4)}`;

function resolverEtapa(etapas, termo) {
  const t = String(termo).trim().toLowerCase();
  const e = etapas.find((x) => String(x.id) === t || (x.descricao || '').toLowerCase() === t) || etapas.find((x) => (x.descricao || '').toLowerCase().includes(t));
  if (!e) throw falha(`Etapa "${termo}" não existe. Etapas desta empresa: ${etapas.map((x) => x.descricao).join(', ')}.`);
  return e;
}

const carteira = {
  name: 'obras_carteira',
  description:
    'A tela Obra 360º › Carteira de obras (dashboard): VGV total e unidades da carteira; por etapa do cronograma (Landbank, Lançamento, Construção, Entrega, Pós Obra…) ' +
    'quantas obras estiveram nela no período, o VGV, as unidades e a fatia da carteira; as obras "a iniciar" na etapa por onde começam; na etapa da construção, as obras ' +
    'EM ATRASO hoje (Regra de Atraso da Construção) e o VGV delas; e a lista das obras com a etapa de hoje ("mês 17 de 30"), cidade, pilar, início e término. ' +
    'Filtros iguais aos da tela: obras, localidades ("Cidade - UF"), etapas marcadas, período De/Até (só mês e ano valem; padrão: 3 meses antes a 20 à frente) ' +
    'ou visao_geral=true (o cronograma inteiro), e etapa_destaque (= clicar no card da etapa: só as obras que passaram por ela no período). ' +
    'Só entram obras com alguma data de etapa (as sem cronograma aparecem só na contagem). Para uma obra em detalhe use obras_obra.',
  inputSchema: {
    obras: z.array(z.string()).optional().describe('Obras (código do centro de custo, apelido ou nome). Vazio = todas.'),
    localidades: z.array(z.string()).optional().describe('Cidades no formato "Cidade - UF" (ou parte do nome). Vazio = todas.'),
    etapas: z.array(z.string()).optional().describe('Etapas marcadas (nome ou id). Vazio = todas — etapa desmarcada some (como o filtro Etapas da tela).'),
    de: dataSchema.optional().describe('Início do período (AAAA-MM-DD; só mês e ano valem).'),
    ate: dataSchema.optional().describe('Fim do período (AAAA-MM-DD; só mês e ano valem).'),
    visao_geral: z.boolean().optional().describe('true = sem período (o cronograma inteiro), como a Visão geral da tela.'),
    etapa_destaque: z.string().optional().describe('Card de etapa clicado: só as obras que estiveram nessa etapa no período.'),
  },
  handler: ferramenta(async (empresaId, args) => {
    const d = await carregar(empresaId);
    const { etapas, hoje } = d;
    const visiveis = args.etapas?.length ? new Set(args.etapas.map((t) => resolverEtapa(etapas, t).id)) : null;
    const etapasVisiveis = visiveis ? etapas.filter((e) => visiveis.has(e.id)) : etapas;
    const marcadas = resolverObras(d.obras, args.obras);
    const locais = (args.localidades || []).map((l) => l.toLowerCase());

    let periodo = null;
    if (!args.visao_geral) {
      periodo = mesesDoPeriodo(hoje);
      if (args.de) periodo.ini = args.de.slice(0, 7);
      if (args.ate) periodo.fim = args.ate.slice(0, 7);
      if (periodo.ini > periodo.fim) periodo = { ini: periodo.fim, fim: periodo.ini };
    }

    // Obras do dashboard: com alguma data de etapa (das etapas marcadas), nos filtros e no período.
    const todas = d.obras.map((o) => {
      const segs = visiveis ? o.segs.filter((s) => visiveis.has(s.etapa.id)) : o.segs;
      return { ...o, segsVis: segs };
    });
    const semCronograma = todas.filter((o) => !o.segsVis.length).length;
    let obras = todas
      .filter((o) => o.segsVis.length)
      .filter((o) => !marcadas || marcadas.some((m) => m.id === o.id))
      .filter((o) => !locais.length || locais.some((l) => localidade(o.centro).toLowerCase().includes(l)))
      .filter((o) => !periodo || o.segsVis.some((s) => noPeriodo(s, periodo)));
    const naRecorte = (o, etapaId) => o.segsVis.some((s) => s.etapa.id === etapaId && (!periodo || noPeriodo(s, periodo)));
    const destaque = args.etapa_destaque ? resolverEtapa(etapasVisiveis, args.etapa_destaque) : null;
    const base = obras;
    if (destaque) obras = obras.filter((o) => naRecorte(o, destaque.id));

    // Situação de hoje só com as etapas visíveis (a tela também).
    const hojeDe = (o) => {
      const seg = o.segsVis.filter((s) => s.inicio <= hoje && (!s.fim || hoje <= s.fim)).at(-1);
      if (seg) return { tipo: 'etapa', etapaId: seg.etapa.id };
      return { tipo: hoje < o.segsVis[0].inicio ? 'aIniciar' : 'concluida', etapaId: o.segsVis[0].etapa.id };
    };
    const soma = (lista, campo) => lista.reduce((s, o) => s + (Number(o.centro[campo]) || 0), 0);
    const nomes = (lista) => lista.map((o) => o.nome);
    const construcaoId = d.atraso?.etapaId;

    const porEtapa = etapasVisiveis.map((etapa) => {
      const lista = base.filter((o) => naRecorte(o, etapa.id));
      const emCursoHoje = base.filter((o) => hojeDe(o).tipo === 'etapa' && hojeDe(o).etapaId === etapa.id);
      const iniciam = base.filter((o) => hojeDe(o).tipo === 'aIniciar' && hojeDe(o).etapaId === etapa.id);
      const atrasadas = etapa.id === construcaoId ? emCursoHoje.filter((o) => o.atrasadaHoje) : null;
      return {
        etapa: etapa.descricao,
        duracao_em: etapa.tipo_duracao === 'ANOS' ? 'anos' : 'meses',
        obras: lista.length,
        quais: nomes(lista),
        vgv: brl(soma(lista, 'valor_geral_vendas')),
        unidades: soma(lista, 'numero_unidades'),
        fatia_da_carteira_pct: base.length ? pc((lista.length / base.length) * 100) : 0,
        nesta_etapa_hoje: nomes(emCursoHoje),
        a_iniciar: iniciam.length ? { obras: iniciam.length, quais: nomes(iniciam), vgv: brl(soma(iniciam, 'valor_geral_vendas')), unidades: soma(iniciam, 'numero_unidades') } : null,
        em_atraso_hoje:
          atrasadas === null
            ? undefined
            : { obras: atrasadas.length, quais: nomes(atrasadas), vgv: brl(soma(atrasadas, 'valor_geral_vendas')) },
      };
    });

    return {
      empresa: d.empresa,
      hoje: br(hoje),
      periodo: periodo ? `${mesAno(periodo.ini)} a ${mesAno(periodo.fim)} (mês a mês: obras com alguma etapa no período)` : 'Visão geral (o cronograma inteiro)',
      recorte: destaque ? `Só as obras que ${periodo ? 'estiveram' : 'passam'} em ${destaque.descricao}${periodo ? ' no período' : ''}` : null,
      vgv_total: brl(soma(obras, 'valor_geral_vendas')),
      unidades: soma(obras, 'numero_unidades'),
      obras_na_carteira: obras.length,
      obras_sem_vgv: obras.filter((o) => !(Number(o.centro.valor_geral_vendas) > 0)).map((o) => o.nome),
      obras_sem_unidades: obras.filter((o) => !(Number(o.centro.numero_unidades) > 0)).map((o) => o.nome),
      a_iniciar: obras.filter((o) => hojeDe(o).tipo === 'aIniciar').length,
      concluidas: obras.filter((o) => hojeDe(o).tipo === 'concluida').length,
      obras_tipo_obra_sem_cronograma: semCronograma,
      regra_de_atraso: d.atraso
        ? d.atraso.regra === 'FIXA'
          ? `Fixa: a construção fica em atraso depois de ${d.atraso.meses} meses do início dela`
          : 'Planejamento: em atraso a partir do mês seguinte ao que a curva S de base do Prevision chega a 100%'
        : 'Sem regra de atraso configurada',
      cards_por_etapa: porEtapa,
      obras: obras.map((o) => ({
        id: o.id,
        obra: o.nome,
        localidade: localidade(o.centro),
        pilar: o.extra.pilar || null,
        etapa_hoje: etapaTexto(o),
        inicio_da_obra: br(o.segs[0]?.inicio),
        termino: br(o.segs.at(-1)?.fim),
        vgv: brl(o.centro.valor_geral_vendas),
        unidades: o.centro.numero_unidades ?? null,
        em_atraso_hoje: o.atrasadaHoje || undefined,
        atraso_da_construcao: o.atraso ? `${o.atraso.meses} ${o.atraso.meses === 1 ? 'mês' : 'meses'} além da regra, de ${br(o.atraso.desde)} a ${br(o.atraso.ate)}` : undefined,
        alteracao_pendente: o.pendencia ? true : undefined,
      })),
    };
  }),
};

module.exports = { carteira };
