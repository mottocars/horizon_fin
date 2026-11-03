const { ferramenta } = require('../dfc/tools/comum');
const { z, falha, r2, r8, pct, br, semAcento, PERIODO, CENTROS, periodo, resolverCentros, painel: carregarPainel, PD } = require('./base');

// O dashboard Econômico Financeiro › Demonstração do Resultado "como uma pessoa olhando a tela" — mesmos
// dados (dashboards/drePainel.service) e mesmo cálculo (painelDre/modelo, cópia gerada da tela por
// backend/scripts/sincronizar-painel-fluxo.js): dre_painel (indicadores, fluxo da receita, origem,
// centros, mês a mês, carteira), dre_poc (a POC de cada obra, do rastreio da aba POC) e dre_simular.

const COR = { good: 'verde', warn: 'amarela', crit: 'vermelha', info: 'azul' };
const partesTxt = (partes) => partes.map((p) => (typeof p === 'string' ? p : p.b)).join('');
const ind = (x) => ({
  receita_bruta: r2(x.rb),
  receita_liquida: r2(x.rl),
  lucro_bruto: r2(x.lb),
  ebitda: r2(x.eb),
  lucro_liquido: r2(x.ll),
  margem_bruta_pct: pct(x.mb),
  margem_ebitda_pct: pct(x.me),
  margem_liquida_pct: pct(x.ml),
});

async function montar(empresaId, a) {
  const p = periodo(a);
  const centros = await resolverCentros(empresaId, a.centros);
  const D = await carregarPainel(empresaId, { ...p, centros });
  if (!D.arvore.length) throw falha('A DRE desta empresa ainda não foi montada (máscaras, plano de contas e centros com "Realiza DRE" no DRE Gerencial).');
  const cab = {
    periodo: `${br(D.meta.de)} a ${br(D.meta.ate)}`,
    comparado_com: `${br(D.meta.anterior.de)} a ${br(D.meta.anterior.ate)} (mesmo período do ano anterior)`,
    centros: centros.length ? D.centros.map((c) => `${c.id} · ${c.nome}`).join(', ') : 'consolidado de todos os centros com "Realiza DRE"',
    ...(D.meta.ate < p.ate ? { observacao: 'O dashboard é do realizado: o fim foi limitado a hoje.' } : {}),
  };
  return { D, cab };
}

const SECOES = ['indicadores', 'fluxo_receita', 'origem_receita', 'centros', 'mensal', 'carteira'];

const painelTool = {
  name: 'dre_painel',
  description:
    'O dashboard Demonstração do Resultado como aparece na tela: os 8 indicadores com valor, detalhe e etiqueta (Receita Líquida, Margem bruta, EBITDA, Lucro Líquido, Resultado a apropriar, Obra executada da carteira, Vendas líquidas, Estoque a vender), ' +
    'o comparativo com o mesmo período do ano anterior, para onde foi cada real que entrou (o diagrama de Sankey e "de cada R$ 100"), de onde veio a receita (avanço de obra × vendas novas × permutas…), ' +
    'quem gera resultado (cada centro), o resultado mês a mês contra o ano anterior e a carteira de obras pela POC. Período padrão: 1º de janeiro até hoje.',
  inputSchema: { ...PERIODO, ...CENTROS, secoes: z.array(z.enum(SECOES)).optional().describe('Só estas seções (padrão: todas).') },
  handler: ferramenta(async (empresaId, a) => {
    const { D, cab } = await montar(empresaId, a);
    const quer = (s) => !a.secoes?.length || a.secoes.includes(s);
    const out = { cabecalho: cab };
    if (quer('indicadores')) {
      out.indicadores = PD.indicadores(D).map((t) => ({ card: t.titulo, valor: t.valor_fmt, detalhe: partesTxt(t.detalhe), etiqueta: `${t.etiqueta.texto} (${COR[t.etiqueta.tom]})` }));
      out.comparativo = { atual: ind(D.atual), ano_anterior: ind(D.anterior) };
      out.faixas_das_etiquetas =
        'Margem bruta: saudável ≥ 30%, adequada ≥ 22%; EBITDA: ≥ 15% / ≥ 8%; Lucro líquido: ≥ 10% / ≥ 3%; Receita líquida: crescendo ≥ +5%, estável até −5%, em queda até −20%; Resultado a apropriar: margem ≥ 30% garantida, ≥ 15% adequada; Obra executada: < 40% início, ≥ 85% fim de ciclo; Estoque: < 10% do VGV quase vendido, < 30% normal.';
    }
    if (quer('fluxo_receita')) {
      const F = PD.fluxoDaReceita(D);
      out.para_onde_foi_a_receita = F
        ? {
            entradas: r2(F.entradas),
            saidas: r2(F.saidas),
            resultado: r2(F.resultado),
            de_onde_entrou: F.col0.map((f) => ({ fonte: f.rotulo, valor: r2(f.valor), ...(f.itens ? { inclui: f.itens.map((i) => `${i.rotulo} ${r2(i.valor)}`) } : {}) })),
            para_onde_foi: F.col2.map((u) => ({ destino: u.rotulo, valor: r2(u.valor), ...(u.filhos?.length ? { detalhe: u.filhos.map((f) => ({ linha: f.rotulo, valor: r2(f.valor) })) } : {}) })),
            de_cada_100_reais: PD.deCada100(F).map((x) => ({ destino: x.rotulo, reais: Math.round(x.valor * 100) / 100 })),
            leitura: 'Visão bruta: linhas positivas da DRE são entradas, negativas são destinos; com prejuízo, ele entra do lado das entradas pra fechar a conta.',
          }
        : 'Sem entradas no período.';
    }
    if (quer('origem_receita')) {
      out.de_onde_veio_a_receita_bruta = {
        receita_bruta: r2(D.atual.rb),
        partes: D.origem.map((o) => ({ origem: o.rotulo, valor: r2(o.valor), pct_da_receita_bruta: D.atual.rb ? pct(o.valor / D.atual.rb) : null, como: o.dica })),
      };
    }
    if (quer('centros')) {
      out.quem_gera_resultado = D.centros
        .map((c) => ({ centro: `${c.id} · ${c.nome}`, natureza: c.natureza, ...ind(c) }))
        .sort((x, y) => (y.lucro_liquido ?? 0) - (x.lucro_liquido ?? 0));
    }
    if (quer('mensal')) {
      out.mes_a_mes = D.meses.map((m) => ({
        mes: m.mes,
        receita_liquida: r2(m.rl),
        lucro_bruto: r2(m.lb),
        ebitda: r2(m.eb),
        lucro_liquido: r2(m.ll),
        ano_anterior: m.ant ? { receita_liquida: r2(m.ant.rl), lucro_liquido: r2(m.ant.ll) } : null,
      }));
    }
    if (quer('carteira')) {
      const c = D.poc.carteira;
      out.carteira_poc = {
        obras: c.obras,
        obra_executada_pct: pct(c.pocR),
        obra_executada_no_inicio_pct: pct(c.pocRIni),
        orcamento_das_obras: r2(c.orcamento),
        a_executar: r2(c.saldo),
        receita_a_reconhecer: r2(c.aRecReceita),
        custo_a_apropriar: r2(c.custoAApropriar),
        resultado_a_apropriar: r2(c.margemApropriar),
        margem_a_apropriar_pct: pct(c.margemApropriarPct),
        obras_sem_orcamento: c.semOrcamento.map((o) => o.nome),
        receita_do_periodo_pela_obra_pct: pct(c.fatiaObra),
        vendas: { unidades: c.vendasQtd, valor: r2(c.vendasValor) },
        distratos: { unidades: c.distratosQtd, valor: r2(c.distratosValor) },
        estoque: { unidades: c.estoqueQtd, valor: r2(c.estoqueValor) },
        vgv: r2(c.vgv),
        unidades: c.unidades,
        obras_resumo: D.poc.obras.map((o) => ({
          obra: o.nome,
          poc_receita_pct: pct(o.pocR),
          avanco_no_periodo_pp: o.pocR !== null && o.pocRIni !== null ? Math.round((o.pocR - o.pocRIni) * 10000) / 100 : null,
          vendida_pct: pct(o.vendida),
          receita_do_periodo: r2(o.recPeriodo),
          custo_do_periodo: r2(o.custoPeriodo),
          resultado_a_apropriar: r2(o.margemApropriar),
          ...(o.estourada ? { alerta: `custo acima do orçamento em ${r2(o.custo - o.orcamento)} (POC travada em 100%)` } : {}),
          ...(o.orcamento === null || !(o.orcamento > 0) ? { alerta: 'sem orçamento: POC de Receita 0, a receita não é reconhecida' } : {}),
        })),
        leitura:
          'Resultado a apropriar (REF) = receita já vendida que falta reconhecer − custo que falta gastar na obra × fração vendida. Obra executada = Σ min(custo, orçamento) ÷ Σ orçamento das obras com orçamento.',
      };
    }
    return out;
  }),
};

// ─── dre_poc ─────────────────────────────────────────────────────────────────────────────────────
const pocTool = {
  name: 'dre_poc',
  description:
    'A POC de cada obra (centros com natureza OBRA), como a aba POC do DRE Gerencial: unidades (vendidas, permuta, estoque, VGV; vendas e distratos no período), ' +
    'POC de Receita (orçamento vigente, custo acumulado, saldo a executar, POC no início e no fim), POC de Despesa (frações vendida, em permuta, distratada, líquida, estoque), ' +
    'a conta de cada linha da DRE com POC (acumulado × POC = reconhecido; − anterior = período; a reconhecer; avanço × base nova), o resultado do período e o resultado a apropriar. Opcional: mês a mês.',
  inputSchema: {
    ...PERIODO,
    obra: z.union([z.string(), z.number()]).optional().describe('Uma obra (id, nome ou apelido). Sem ela: todas.'),
    mensal: z.boolean().optional().describe('Inclui a POC e o reconhecido mês a mês.'),
  },
  handler: ferramenta(async (empresaId, a) => {
    const { D, cab } = await montar(empresaId, { ...a, centros: [] });
    let obras = D.poc.obras;
    if (a.obra !== undefined) {
      const t = semAcento(a.obra);
      obras = obras.filter((o) => String(o.id) === t || semAcento(o.nome).includes(t));
      if (!obras.length) throw falha(`Nenhuma obra com "${a.obra}". Obras: ${D.poc.obras.map((o) => `${o.id} ${o.nome}`).join('; ')}.`);
    }
    const linhas = D.poc.linhas;
    const fotoLinhas = (foto) =>
      linhas
        .map((l) => {
          const x = foto.linhas[l.id];
          if (!x) return null;
          const partes = D.poc.partes(l, x);
          return {
            linha: l.descricao,
            tipo: l.estorno ? 'estorno de custo' : l.tipo === 'RECEITA' ? 'POC de Receita' : 'POC de Despesa',
            acumulado: r2(x.acumulado),
            poc_aplicada: r8(x.poc),
            reconhecido: r2(x.reconhecido),
            reconhecido_antes: r2(x.anterior),
            no_periodo: r2(x.periodo),
            a_reconhecer: r2(x.a_reconhecer),
            avanco_de_obra: r2(partes.obra),
            vendas_novas: r2(partes.vendas),
          };
        })
        .filter(Boolean);
    return {
      cabecalho: cab,
      leitura:
        'Receita: reconhecido = vendas acumuladas × POC de Receita. Custo (CIV): reconhecido = custo acumulado × POC de Despesa (fração vendida). No período = reconhecido no fim − reconhecido até a véspera. ' +
        'Avanço de obra (receita) = base antiga × ΔPOC; vendas novas = base nova × POC de hoje. No custo os papéis se invertem: vendas novas = custo antigo × Δfração vendida; avanço = custo novo × fração de hoje.',
      obras: obras.map((o) => {
        const f = o.foto;
        const pr = f.poc_receita;
        const pd = f.poc_despesa;
        const un = f.unidades;
        return {
          obra: `${o.id} · ${o.nome}`,
          unidades: un
            ? {
                vendidas: { qtd: un.vendidas.qtd, valor: r2(un.vendidas.valor) },
                permuta: { qtd: un.permuta.qtd, valor: r2(un.permuta.valor) },
                estoque: { qtd: un.estoque.qtd, valor_estimado: r2(un.estoque.valor) },
                total_vgv: { qtd: un.total.qtd, valor: r2(un.total.valor) },
                vendas_no_periodo: { qtd: un.vendas_intervalo.qtd, valor: r2(un.vendas_intervalo.valor) },
                distratos_no_periodo: { qtd: un.distratos_intervalo.qtd, valor: r2(un.distratos_intervalo.valor) },
              }
            : null,
          poc_receita: pr
            ? { orcamento_vigente: r2(pr.orcamento), custo_acumulado: r2(pr.custo), saldo_a_executar: r2(pr.saldo), poc_inicio: r8(pr.poc_inicio), poc_fim: r8(pr.poc), ...(o.estourada ? { alerta: 'custo acima do orçamento: POC travada em 100%' } : {}), ...(!(pr.orcamento > 0) ? { alerta: 'sem orçamento: POC 0' } : {}) }
            : 'POC de Receita não configurada',
          poc_despesa: {
            fracao_vendida: r8(pd.vendas),
            fracao_permuta: r8(pd.permuta),
            poc_despesa: r8(pd.poc),
            fracao_distratada: r8(pd.distratada),
            liquida: r8(pd.liquida),
            estoque: r8(pd.estoque),
            liquida_no_inicio: r8(pd.liquida_inicio),
          },
          linhas: fotoLinhas(f),
          resultado_do_periodo: { receita: r2(o.recPeriodo), custo: r2(o.custoPeriodo), margem: r2(o.margemPeriodo) },
          a_apropriar: {
            receita_a_reconhecer: r2(o.aRecReceita),
            custo_a_incorrer: r2(o.custoAIncorrer),
            custo_a_apropriar: r2(o.custoAApropriar),
            resultado_a_apropriar: r2(o.margemApropriar),
            margem_pct: pct(o.margemApropriarPct),
          },
          ...(a.mensal
            ? {
                mes_a_mes: o.meses.map((mm) => ({
                  mes: mm.mes,
                  poc_receita: mm.poc_receita ? r8(mm.poc_receita.poc) : null,
                  fracao_vendida_liquida: r8(mm.poc_despesa.liquida),
                  vendas: mm.unidades?.vendas_intervalo.qtd ?? null,
                  distratos: mm.unidades?.distratos_intervalo.qtd ?? null,
                  reconhecido_no_mes: Object.fromEntries(linhas.filter((l) => mm.linhas[l.id]).map((l) => [l.descricao, r2(mm.linhas[l.id].periodo)])),
                })),
              }
            : {}),
        };
      }),
    };
  }),
};

// ─── dre_simular ─────────────────────────────────────────────────────────────────────────────────
const simularTool = {
  name: 'dre_simular',
  description:
    'Simulador do dashboard Demonstração do Resultado: aplica cenários sobre a DRE do período pela lógica da POC (nada é gravado) e mostra o antes × depois (Receita, Lucro Bruto, EBITDA, Lucro Líquido e margens) e quanto cada alavanca contribuiu. ' +
    'Alavancas: vendas do período (%), obra executada a mais (p.p.), revisão do orçamento das obras (%), vender parte do estoque agora (%), despesas sem POC (%). ' +
    'Cenários prontos: base (realizado), cons (conservador: vendas −10%, orçamento +2%, despesas +5%), stress (vendas −25%, orçamento +5%, despesas +10%), acel (aceleração: obra +10 p.p., vender 25% do estoque).',
  inputSchema: {
    ...PERIODO,
    ...CENTROS,
    cenario: z.enum(['base', 'cons', 'stress', 'acel']).optional().describe('Cenário pronto; as alavancas informadas sobrepõem.'),
    vendas_pct: z.number().min(-100).max(200).optional(),
    avanco_pp: z.number().min(0).max(100).optional().describe('Pontos percentuais de obra executada a mais.'),
    orcamento_pct: z.number().min(-50).max(100).optional().describe('Revisão do orçamento (+ = mais caro: a POC cai).'),
    estoque_pct: z.number().min(0).max(100).optional().describe('Percentual do estoque vendido agora (pelo valor estimado).'),
    despesas_pct: z.number().min(-100).max(200).optional(),
  },
  handler: ferramenta(async (empresaId, a) => {
    const { D, cab } = await montar(empresaId, a);
    const base = PD.PRESETS[a.cenario || 'base'];
    const p = {
      vendas: a.vendas_pct ?? base.vendas,
      avanco: a.avanco_pp ?? base.avanco,
      orcamento: a.orcamento_pct ?? base.orcamento,
      estoque: a.estoque_pct ?? base.estoque,
      despesas: a.despesas_pct ?? base.despesas,
    };
    const s = PD.simular(D, p);
    const preset = PD.presetDe(p);
    return {
      cabecalho: cab,
      cenario: preset ? PD.PRESETS[preset].label : 'personalizado',
      alavancas: p,
      realizado: ind(s.base),
      cenario_simulado: ind(s.cen),
      impacto_no_lucro_liquido: r2(s.cen.ll - s.base.ll),
      contribuicao_por_alavanca: s.contrib.map((c) => ({ alavanca: c.rotulo, efeito_no_resultado: r2(c.valor) })),
      como_cada_alavanca_funciona: [
        'Vendas %: muda as vendas novas do período — a receita delas (base nova × POC de Receita) e o custo que a fração vendida a mais carrega.',
        'Obra + p.p.: mais obra executada — a receita já vendida reconhece mais (base × ΔPOC) e o custo gasto a mais entra no CIV pela fração vendida (o estorno devolve a parte distratada).',
        'Orçamento %: revisão do orçamento — a POC cai (custo ÷ orçamento maior) e a receita reconhecida recua na mesma proporção.',
        'Estoque %: vender agora parte do estoque (valor estimado) — receita × POC de hoje e o custo dessa fração no CIV. Obras sem orçamento ficam de fora.',
        'Despesas %: despesas sem POC entre o Lucro Bruto e o EBITDA (administrativas, comerciais…).',
        'O imposto fixo (RET) acompanha pela alíquota efetiva do período sobre o que está acima dele.',
      ],
    };
  }),
};

module.exports = { painelTool, pocTool, simularTool };
