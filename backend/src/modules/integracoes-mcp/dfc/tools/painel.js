const pool = require('../../../../config/db');
const painelService = require('../../../dashboards/fluxoCaixaPainel.service');
const M = require('../../../dashboards/painelFluxo/modelo');
const A = require('../../../dashboards/painelFluxo/analise');
const { ABAS_SUMARIO, sumarioMarkdown } = require('../../../dashboards/painelFluxo/sumarioTexto');
const { z, falha, r2, ferramenta, resolverCentros } = require('./comum');

// O dashboard Econômico Financeiro › Fluxo de Caixa "como uma pessoa olhando a tela": os mesmos dados
// (fluxoCaixaPainel.service), o mesmo cálculo (painelFluxo/modelo + analise, cópia gerada da tela) e as
// mesmas explicações (painelFluxo/sumarioTexto, o Sumário da tela). Cada seção volta com o que está
// escrito na tela — títulos, valores formatados, etiquetas com a cor — e os números por trás.

const SECOES = [
  'indicadores',
  'detalhamento',
  'trajetoria',
  'simulador',
  'entradas_saidas',
  'folego_spe',
  'quem_gera',
  'carteira',
  'orcamento_erra',
  'maiores_saidas',
  'divida_pj',
];
// Aba do Sumário de cada seção (explicação).
const ABA_DA_SECAO = {
  indicadores: 'indicadores',
  detalhamento: 'detalhamento',
  trajetoria: 'trajetoria',
  simulador: 'trajetoria',
  entradas_saidas: 'entradas',
  folego_spe: 'folego',
  quem_gera: 'quemgera',
  carteira: 'carteira',
  orcamento_erra: 'orcamento',
  maiores_saidas: 'saidas',
  divida_pj: 'divida',
};
const COR_TOM = { good: 'verde', warn: 'amarela', crit: 'vermelha', info: 'azul' };
const etiquetaTxt = (e) => (e ? `${e.texto} (${COR_TOM[e.tom]})` : null);
const partesTxt = (partes) => partes.map((p) => (typeof p === 'string' ? p : `**${p.b}**`)).join('');
const PRESET_DE = { orcamento: 'base', conservador: 'cons', estresse: 'stress' };

module.exports = {
  name: 'dfc_painel_fluxo_caixa',
  description:
    'O dashboard Econômico Financeiro › Fluxo de Caixa como aparece na tela, para analisar como uma pessoa olhando o painel: ' +
    'cabeçalho, os 8 indicadores com as etiquetas (verde/amarela/vermelha), o fluxo resumido (tabela fechada), a trajetória do ' +
    'caixa e o colchão, o simulador de cenário (Orçamento / Conservador / Estresse ou personalizado), entradas e saídas ' +
    'operacionais, o fôlego de cada SPE (quando zera), quem gera e quem consome caixa, carteira e liquidez, onde o Orçamento erra, ' +
    'maiores saídas e dívida PJ. Mesmos filtros da tela (histórico, horizonte contando o mês atual, centros ou uma SPE). ' +
    'Com explicar=true traz também o Sumário da tela (o que cada análise mostra, como é calculada e como ler). ' +
    'Para abrir uma linha do fluxo até as naturezas use dfc_fluxo_caixa; para a origem de um valor, dfc_detalhar_valor.',
  inputSchema: {
    historico: z.number().int().min(1).max(36).default(1).describe('Meses de realizado antes do mês atual (a tela abre com 1).'),
    horizonte: z.number().int().min(1).max(36).default(6).describe('Meses de projeção contando o mês atual (a tela abre com 6).'),
    centros: z.array(z.union([z.string(), z.number()])).optional().describe('Centros de custo (ids ou nomes). Vazio = consolidado.'),
    spe: z
      .union([z.string(), z.number()])
      .optional()
      .describe('Uma empresa (SPE) pelo nome ou company_id — como clicar nela no Fôlego: filtra pelos centros dela. Não use junto com centros.'),
    secoes: z.array(z.enum(SECOES)).optional().describe('Só estas seções (padrão: todas).'),
    cenario: z
      .object({
        preset: z.enum(['orcamento', 'conservador', 'estresse']).default('conservador'),
        estrutura_fixa_ritmo_real: z.boolean().optional(),
        estouro_obra_pct: z.number().min(0).max(100).optional(),
        queda_vendas_pct: z.number().min(0).max(100).optional(),
        atrasar_obra: z.union([z.string(), z.number()]).optional().describe('Centro cujas entradas atrasar (padrão: a obra de maior entrada).'),
        atrasar_meses: z.number().int().min(0).max(24).optional(),
      })
      .optional()
      .describe('Simulador: parte do preset (a tela abre no Conservador) e aplica os ajustes informados.'),
    explicar: z.boolean().default(false).describe('Inclui o Sumário (explicação) das seções pedidas.'),
  },
  handler: ferramenta(async (empresaId, a) => {
    const historico = a.historico ?? 1;
    const horizonte = a.horizonte ?? 6;
    const secoes = a.secoes?.length ? a.secoes : SECOES;
    const quer = (s) => secoes.includes(s);
    if (a.spe && a.centros?.length) throw falha('Use centros OU spe, não os dois.');

    // Filtro de centros: lista, ou os centros com Projeta DFC de uma SPE (como o clique no Fôlego).
    let ids = await resolverCentros(empresaId, a.centros);
    let speNome = null;
    if (a.spe !== undefined) {
      const t = String(a.spe).trim();
      const { rows } = await pool.query(
        `SELECT DISTINCT company_id, company_name FROM centros_custo_sienge WHERE empresa_id = $1 AND projeta_dfc AND company_id IS NOT NULL`,
        [empresaId]
      );
      const achadas = /^\d+$/.test(t)
        ? rows.filter((r) => String(r.company_id) === t)
        : rows.filter((r) => M.curto(r.company_name).toLowerCase() === t.toLowerCase() || r.company_name.toLowerCase().includes(t.toLowerCase()));
      if (achadas.length !== 1) {
        throw falha(
          achadas.length
            ? `"${t}" corresponde a várias empresas: ${achadas.map((r) => `${r.company_id} ${M.curto(r.company_name)}`).join('; ')}.`
            : `Nenhuma SPE com "${t}". Empresas: ${rows.map((r) => `${r.company_id} ${M.curto(r.company_name)}`).join('; ')}.`
        );
      }
      speNome = M.curto(achadas[0].company_name);
      const { rows: cs } = await pool.query('SELECT sienge_id FROM centros_custo_sienge WHERE empresa_id = $1 AND projeta_dfc AND company_id = $2', [
        empresaId,
        achadas[0].company_id,
      ]);
      ids = cs.map((c) => c.sienge_id);
    }

    const d = await painelService.painel(empresaId, { hist: historico, hor: horizonte, centros: ids });
    const D = M.modelo(d, ids.length ? ids : null);
    if (!D) throw falha('Sem dados do fluxo para montar o painel.');

    // Escopo (como o cabeçalho da tela).
    const nomeCentro = (id) => M.titulo(d.centros.find((c) => c.id === id)?.nome || `centro ${id}`);
    const escopo = !ids.length ? null : speNome || (ids.length === 1 ? nomeCentro(ids[0]) : `${ids.length} centros`);
    const hoje = A.diaMes(D.hoje);
    const out = {
      painel: 'Econômico Financeiro › Fluxo de Caixa',
      cabecalho: {
        empresa: d.info.empresa,
        extrato_ate: d.info.extratoAte ? d.info.extratoAte.split('-').reverse().join('/') : null,
        orcamento: d.info.versao ? `v${d.info.versao.numero} · ${new Date(d.info.versao.criado_em).toLocaleDateString('pt-BR')}` : null,
        hoje: D.hoje.split('-').reverse().join('/'),
        mes_atual: M.lbl(D.m0),
        regra:
          'Foto de hoje: saldos, carteira e realizado vão até hoje (extrato e Aging do Sienge até a última atualização); o Orçamento (última versão salva) só entra no que ainda vai acontecer — no mês atual, o que falta (orçado − realizado até hoje, por centro × natureza, sem inverter o sinal); nos seguintes, o orçado inteiro.',
        escopo: escopo || 'Consolidado',
        historico: `${historico} ${historico === 1 ? 'mês' : 'meses'} (${M.lbl(D.meses[0])}${D.hist.length > 1 ? ` a ${M.lbl(D.hist.at(-1))}` : ''})`,
        horizonte: `${horizonte} ${horizonte === 1 ? 'mês' : 'meses'} contando o mês atual (${M.lbl(D.fut[0])} a ${M.lbl(D.fut.at(-1))})`,
      },
      caixa: { hoje: M.brl(D.caixaHoje), abertura_do_mes: M.brl(D.caixaAbertura) },
      colchao: {
        valor: r2(D.colchao),
        fmt: M.brl(D.colchao),
        significado: '1 mês de saídas operacionais (média do horizonte; no mês atual, realizado até hoje + o que falta)',
      },
    };

    if (quer('indicadores')) {
      out.indicadores = A.indicadores(D).map((t) => ({
        card: t.titulo,
        valor: t.valor_fmt,
        numero: t.valor === null ? null : r2(t.valor),
        detalhe: partesTxt(t.detalhe),
        etiqueta: etiquetaTxt(t.etiqueta),
      }));
    }

    if (quer('detalhamento')) {
      // A tabela fechada: saldo inicial, cada grupo (máscara 1), resultado e saldo final por coluna.
      const cols = d.fluxo.colunas;
      const linha = (pc) => Object.fromEntries(cols.map((c) => [c, r2(pc?.[c] || 0)]));
      out.detalhamento = {
        colunas: cols.map((c) => `${M.lbl(c.slice(0, 7))} ${c.endsWith('|R') ? 'realizado' : 'projetado'}`),
        chave_das_colunas: 'AAAA-MM|R = realizado, AAAA-MM|P = projetado',
        linhas: [
          { linha: 'Saldo inicial', valores: linha(d.fluxo.saldoInicial) },
          ...d.fluxo.estrutura.map((n1) => ({ linha: n1.descricao, valores: linha(n1.porColuna) })),
          { linha: 'Resultado do mês', valores: linha(d.fluxo.resultado) },
          { linha: 'Saldo final', valores: linha(d.fluxo.saldoFinal) },
        ],
        para_abrir: 'dfc_fluxo_caixa (nível mascara_2 ou natureza) abre as linhas; dfc_detalhar_valor mostra a origem de um valor.',
      };
    }

    // Simulador (também usado na trajetória).
    let serieCenario = null;
    let sc = null;
    if (quer('trajetoria') || quer('simulador')) {
      const c = a.cenario || {};
      const base = M.PRESETS[PRESET_DE[c.preset || 'conservador']];
      let delayId = null;
      if (c.atrasar_obra !== undefined) [delayId] = await resolverCentros(empresaId, [c.atrasar_obra]);
      else delayId = M.obraMaiorEntrada(D)?.id ?? A.opcoesAtraso(D)[0]?.id ?? null;
      sc = {
        overhead: c.estrutura_fixa_ritmo_real ?? base.overhead,
        obra: c.estouro_obra_pct ?? base.obra,
        vendas: c.queda_vendas_pct ?? base.vendas,
        delay: c.atrasar_meses ?? base.delay,
        delayId,
      };
      serieCenario = M.cenario(D, sc);
    }

    if (quer('trajetoria')) {
      out.trajetoria = {
        titulo: A.tituloTrajetoria(D, escopo),
        pontos: [
          ...D.hist.map((m, i) => ({ quando: `fim de ${M.lbl(m)}`, tipo: 'realizado', saldo: r2(D.saldoHist[i]) })),
          { quando: `hoje (${hoje})`, tipo: 'realizado', saldo: r2(D.caixaHoje) },
          ...D.fut.map((m, i) => ({
            quando: `fim de ${M.lbl(m)}`,
            tipo: 'projetado',
            saldo_orcamento: r2(D.saldoFut[i]),
            saldo_cenario: r2(serieCenario[i]),
            [i === 0 ? 'a_acontecer_ate_o_fim_do_mes' : 'resultado_do_mes']: r2(D.resFut[i]),
            abaixo_do_colchao: D.saldoFut[i] < D.colchao,
          })),
        ],
        minimo_orcamento: { mes: M.lbl(D.fut[D.minIdx]), valor: r2(D.minBase), fmt: M.brl(D.minBase) },
        nota: 'A projeção parte do saldo de hoje; no mês atual soma só o que falta acontecer.',
      };
    }

    if (quer('simulador')) {
      const preset = M.presetDe(sc);
      const mv = Math.min(...serieCenario);
      const mi = serieCenario.indexOf(mv);
      const fura = serieCenario.findIndex((v) => v < D.colchao);
      const atrasada = D.centros.find((x) => x.id === sc.delayId);
      out.simulador = {
        cenario: preset ? M.PRESETS[preset].label : 'Cenário personalizado',
        ajustes: {
          estrutura_fixa_ritmo_real: sc.overhead
            ? `sim — Pessoal e Administrativo a ${M.brl(D.overheadRun)}/mês quando o Orçamento projeta menos`
            : 'não',
          estouro_custo_obra: `${sc.obra}%`,
          queda_receita_vendas: `${sc.vendas}%`,
          atraso_entradas: sc.delay ? `${sc.delay} ${sc.delay === 1 ? 'mês' : 'meses'} em ${atrasada?.nome || '—'}` : 'nenhum',
        },
        minimo: { mes: M.lbl(D.fut[mi]), valor: r2(mv), fmt: M.brl(mv) },
        fura_o_colchao_em: fura >= 0 ? M.lbl(D.fut[fura]) : 'não fura no horizonte',
        saldo_no_fim: { cenario: M.brl(serieCenario.at(-1)), orcamento: M.brl(D.saldoFut.at(-1)), diferenca: M.brl(serieCenario.at(-1) - D.saldoFut.at(-1), true) },
        obras_que_podem_atrasar: A.opcoesAtraso(D).map((x) => x.nome),
      };
    }

    if (quer('entradas_saidas')) {
      // O mês atual vem duas vezes: realizado até hoje e orçado do mês inteiro (como na tela).
      const rotTipo = { realizado: 'realizado', parcial: `realizado até ${hoje}`, orcado_mes: 'orçado no mês inteiro', projetado: 'orçado' };
      out.entradas_saidas = A.serieEntradasSaidas(D).map((x) => ({
        mes: M.lbl(x.mes),
        tipo: rotTipo[x.tipo],
        entradas: r2(x.ent),
        saidas: r2(x.sai),
        liquido: r2(x.liq),
      }));
      if (D.saiOrcMes) out.entradas_saidas_mes_atual = {
        saidas_realizadas_pct_do_orcado: M.pct((Math.abs(D.saiMtd) / Math.abs(D.saiOrcMes)) * 100),
        entradas_realizadas_pct_do_orcado: D.entOrcMes ? M.pct((D.entMtd / D.entOrcMes) * 100) : null,
        dia_do_mes: `${Number(D.hoje.slice(8, 10))} de ${new Date(Date.UTC(+D.hoje.slice(0, 4), +D.hoje.slice(5, 7), 0)).getUTCDate()} dias`,
      };
    }

    if (quer('folego_spe')) {
      const f = A.folego(D, { ordem: 'risco', mostrar: 'todas' });
      const linhaSpe = (s) => ({
        empresa: s.centros && s.situacao ? M.curto(s.nome) : s.nome,
        centros: s.centros.join(', ') || 'sem centros com fluxo',
        situacao: etiquetaTxt(s.situacao),
        hoje: M.brl(s.caixa),
        saldo_fim_de_mes: Object.fromEntries(D.fut.map((m, i) => [M.lbl(m), r2(s.path[i])])),
        minimo: `${M.brl(s.min)} em ${M.lbl(D.fut[s.minIdx])}`,
      });
      out.folego_spe = {
        resumo: f.resumo,
        empresas_por_risco: f.linhas.map(linhaSpe),
        soma: { ...linhaSpe(f.total), situacao: null },
      };
    }

    if (quer('quem_gera')) {
      const q = A.quemGera(D);
      out.quem_gera = {
        colunas: { realizado: `realizado até ${hoje}`, projetado: `a acontecer até ${M.lbl(D.fut.at(-1))} (o que falta do mês atual + os seguintes)` },
        centros: q.linhas.map((r) => ({
          centro: r.nome,
          realizado: M.brl(r.lr, true),
          projetado: M.brl(r.lp, true),
          gera_ou_consome: r.lp >= 0 ? 'gera caixa' : 'consome caixa',
          selo: r.etiqueta ? `${r.etiqueta.texto} — ${r.etiqueta.dica}` : null,
        })),
      };
    }

    if (quer('carteira')) {
      const c = A.carteira(D);
      out.carteira = {
        numeros: Object.fromEntries(c.numeros.map((n) => [n.rotulo, M.brl(n.valor)])),
        contas: c.contas.map((x) => ({ conta: M.titulo(x.nome || x.conta), empresa: M.curto(x.empresa), numero: x.conta, tipo: x.investimento ? 'Investimento' : 'Conta corrente', saldo: M.brl(x.saldo) })),
      };
    }

    if (quer('orcamento_erra')) {
      out.orcamento_erra = {
        periodo: D.hist.length ? `${M.lbl(D.hist[0])} a ${M.lbl(D.hist.at(-1))} (meses fechados)` : 'sem histórico',
        linhas: A.calibracao(D).map((c) => ({
          linha: c.nome,
          lado: c.lado === 'ent' ? 'entrada' : 'saída',
          realizado: M.brl(Math.abs(c.r)),
          projetado: M.brl(Math.abs(c.p)),
          desvio: M.pct(c.dv, true),
          avaliacao: c.ruim ? 'desfavorável (vermelho)' : 'favorável',
        })),
      };
    }

    if (quer('maiores_saidas')) {
      out.maiores_saidas = {
        periodo: `${D.hist.length ? M.lbl(D.hist[0]) : M.lbl(D.m0)} até ${hoje} (realizado)`,
        favorecidos: A.maioresSaidas(d.forn).map((f) => ({
          favorecido: f.nome,
          pago: M.brl(-f.valor),
          lancamentos: f.lancamentos,
          linha: f.linha,
          tipo: f.obra ? 'custo de obra (vermelho)' : 'demais saídas (cinza)',
        })),
      };
    }

    if (quer('divida_pj')) {
      out.divida_pj = A.dividaPj(D).map((c) => ({
        obra: c.nome,
        saldo_devedor: `${M.brl(c.now.saldo)} em ${M.lbl(c.now.mes)}`,
        teto_pj: M.brl(c.p.teto),
        obra_executada: `${M.pct(c.now.obra)} em ${M.lbl(c.now.mes)}`,
        juros_ao_mes: c.p.taxa_juros_mes != null ? M.pct(+c.p.taxa_juros_mes) : null,
        amortizacao_pj: c.p.pct_amortizacao_pj != null ? `${M.nf0.format(c.p.pct_amortizacao_pj)}%` : null,
        no_fim_da_projecao: { mes: M.lbl(c.end.mes), saldo_devedor: M.brl(c.end.saldo), juros: M.brl(c.end.juros) },
        unidades: c.unidades,
        saldo_devedor_por_mes: Object.fromEntries(c.rows.map((r) => [M.lbl(r.mes), r2(r.saldo)])),
      }));
    }

    if (a.explicar) {
      const abas = ['filtros', ...new Set(secoes.map((s) => ABA_DA_SECAO[s]))];
      out.explicacao = sumarioMarkdown(abas.filter((id) => ABAS_SUMARIO.some((x) => x.id === id)));
    }
    return out;
  }),
};
