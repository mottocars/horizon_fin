const pool = require('../../../config/db');
const { ABAS_SUMARIO } = require('../../dashboards/painelDre/sumarioTexto');
const { textoSimples } = require('../../dashboards/painelFluxo/sumarioTexto');
const { ferramenta } = require('../dfc/tools/comum');
const { periodo, dados, br, rotulo, pct } = require('./base');
const { orcamentoEm } = require('./conta');

// dre_guia — "comece por aqui": como a DRE é gerada (do lançamento no Sienge até a linha da DRE), a
// configuração DESTA empresa (máscaras e a regra de cada linha, POC, alíquotas, centros, documentos fora),
// de onde vem cada dado e quando foi atualizado (Monitor de Integrações), a auditoria, o dashboard (o
// Sumário da tela inteiro), um glossário de CFO e qual ferramenta usar para cada pergunta.

// Rotinas do Monitor que alimentam a DRE (monitor-integracoes/rotinas.js).
const ROTINAS_DRE = [
  ['sienge_centros_custo', 'Cadastro de centros de custo (Sienge)'],
  ['sienge_plano_contas', 'Plano de contas (Sienge)'],
  ['cobranca_base', 'Base do contas a receber (Sienge) — receitas financeiras e correção monetária'],
  ['dfc_contas_pagar_base', 'Base do contas a pagar (Sienge) — custos e despesas'],
  ['dfc_saldos_contas', 'Saldos das contas (Sienge) — movimentos do extrato e recebido nos distratos'],
  ['repasses_contratos', 'Contratos de venda (Sienge) — vendas, distratos e frações vendidas'],
];

const FREQ = { diaria: 'diária', semanal: 'semanal', mensal: 'mensal' };

async function situacaoFontes(empresaId) {
  const chaves = ROTINAS_DRE.map(([c]) => c);
  const [{ rows: ag }, { rows: ex }] = await Promise.all([
    pool.query('SELECT rotina, ativo, frequencia, horario FROM monitor_integracoes_agendamentos WHERE empresa_id = $1 AND rotina = ANY($2)', [empresaId, chaves]),
    pool.query(
      `SELECT rotina, MAX(iniciado_em) FILTER (WHERE status = 'sucesso') AS sucesso,
              (array_agg(status ORDER BY iniciado_em DESC))[1] AS ultimo_status, MAX(iniciado_em) AS ultima
         FROM monitor_integracoes_execucoes WHERE empresa_id = $1 AND rotina = ANY($2) GROUP BY rotina`,
      [empresaId, chaves]
    ),
  ]);
  const quando = (v) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : 'nunca');
  return ROTINAS_DRE.map(([chave, nome]) => {
    const a = ag.find((x) => x.rotina === chave);
    const e = ex.find((x) => x.rotina === chave);
    const agenda = a?.ativo ? `agendada (${FREQ[a.frequencia] || a.frequencia}, ${String(a.horario).slice(0, 5)})` : 'SEM agendamento (só manual)';
    return `- ${nome}: ${agenda}; último sucesso ${quando(e?.sucesso)}${e && e.ultimo_status !== 'sucesso' ? ` — ATENÇÃO: a última execução (${quando(e.ultima)}) terminou com ${e.ultimo_status}` : ''}.`;
  });
}

const guia = {
  name: 'dre_guia',
  description:
    'Comece por aqui. Explica a DRE Gerencial de ponta a ponta, como um CFO precisa entender: como cada linha é gerada a partir do Sienge ' +
    '(Financeiro, contratos, unidades, correção monetária, orçamento), o princípio do acumulado com a POC (de Receita e de Despesa), CIV, ' +
    'estorno de custo, RET, sem POC, AV % e AH %; a configuração desta empresa (máscaras e a regra de cada linha, máscara da POC, alíquotas, ' +
    'centros, plano de contas, documentos fora da DRE); de onde vem cada dado e quando foi atualizado (Monitor de Integrações); a auditoria ' +
    '(Excel e conferências); o dashboard Demonstração do Resultado (Sumário da tela inteiro); glossário; e qual ferramenta usar.',
  inputSchema: {},
  handler: ferramenta(async (empresaId) => {
    const p = periodo({});
    const [d, fontes] = await Promise.all([dados(empresaId, { ...p, centros: [] }), situacaoFontes(empresaId)]);
    const { m, extras } = d;
    const quando = (v) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—');
    const grupos = new Map(d.arvore.map((g) => [g.id, g.descricao]));
    const nomes = new Map((extras.nomes_documentos || []).map((x) => [x.documento, x.nome]));
    const md = [
      `# DRE Gerencial — ${extras.empresa}`,
      `Hoje: ${br(p.ate)}. A DRE não é guardada pronta: ela é calculada na hora, a partir das bases do Sienge já gravadas no Horizon, com as regras abaixo. Fica tão atualizada quanto essas bases.`,
      '',
      '## Como a DRE é gerada, do Sienge até a linha',
      '1. **Centros de custo**: entram só os marcados com "Realiza DRE" (aba Centros Custos), na ordem dessa aba. O **consolidado é a soma dos centros**. Cada centro é calculado sozinho, mês a mês.',
      '2. **Máscaras** (aba Máscaras): grupos de **nível 1** (com sinal +, −, +/−) e linhas de **nível 2**. Cada linha tem uma **Origem** e um **Cálculo** (de onde vem e como se calcula) e pode ter **% POC** (de Receita ou de Despesa). As **totalizadoras** (=) somam tudo o que está acima delas (Receita Líquida, Lucro Bruto, EBITDA, Lucro Líquido).',
      '3. **Plano de contas da DRE** (aba Plano Contas): cada natureza do Sienge aponta para uma linha de nível 2, ou "NÃO ENTRA NA DRE". Vale o plano próprio do centro, se ele tiver; senão, o Global.',
      '4. **Bases** (todas com o rateio por centro × natureza do Sienge):',
      '   - **Financeiro** (aba Financeiro): títulos a receber (valor líquido dos impostos retidos) e a pagar pela **data de emissão**; movimentos do extrato sem título, pela data; lançamentos criados à mão no Horizon. Os **ajustes** do Horizon (troca de centro, natureza ou valor de uma linha) já estão aplicados. Tipos de documento marcados como fora da DRE (aba Configurações, ex.: previsões) não entram.',
      '   - **Contratos e unidades** (aba Unidades): **toda venda** (inclusive a cancelada depois) pela data do contrato, com valor × participação da unidade; **distratos** pela data do cancelamento; **permutas** pela data e valor da avaliação; a **fração ideal** de cada unidade.',
      '   - **Correção monetária** (aba Correções): paga + reparcelada + em aberto (saldo corrigido − saldo, foto de hoje), pelo **vencimento** da parcela, até o mês atual.',
      '   - **Orçamento das obras** (aba Orçamento): versões por data de início; em cada data vale a de início mais recente.',
      '',
      '## O princípio: tudo pelo acumulado',
      'Valor da linha no período = **base acumulada até o fim × fator no fim − base acumulada até a véspera do início × fator na véspera** (o que já tinha sido reconhecido antes). Por isso o período nunca reconhece duas vezes: uma venda antiga só entra pelo quanto a obra andou; uma venda nova entra com todo o avanço já feito. O valor se abre em duas partes: **avanço sobre a base antiga** (base da véspera × Δfator) + **base nova × fator do fim**.',
      'Exemplo: unidade vendida em 2025 por R$ 500 mil numa obra 40% executada em 31/12/2025 e 60% em 31/12/2026. Até 2025 a DRE reconheceu 500 × 40% = R$ 200 mil. Em 2026 reconhece 500 × 60% − 200 = **R$ 100 mil** (avanço de obra). Uma venda nova de R$ 300 mil assinada em 2026 entra com 300 × 60% = **R$ 180 mil** (base nova). O custo funciona ao contrário: o custo gasto na obra só vira despesa na proporção do que já está vendido.',
      '',
      '## As regras de cálculo',
      `- **POC de Receita** (obra executada): custo acumulado da obra na máscara "${m.mascaraPoc?.descricao || 'NÃO CONFIGURADA'}" ÷ orçamento vigente, até 100%, com 6 casas no percentual. Multiplica vendas, permutas, correção monetária e estorno de vendas (as linhas com POC de Receita). Obra sem orçamento tem POC 0: a receita dela não é reconhecida.`,
      '- **POC de Despesa** (vendido): fração ideal vendida (todo contrato, até o cancelado depois, × participação) + fração em permuta, sem trava em 100%. Multiplica o **CIV** (custo dos imóveis vendidos: as linhas com POC de Despesa do grupo que tem o Estorno de Custo).',
      '- **Estorno de custo**: −(custos do grupo do CIV acumulados) × fração distratada (até 100%): devolve o custo das unidades distratadas.',
      '- **Outras linhas com POC de Despesa** (comissão, legalização…): lançado acumulado × (POC de Despesa − fração distratada) — o mesmo que o CIV líquido do estorno.',
      '- **Linhas sem POC**: o valor lançado no período (emissão; no extrato, a data do movimento). Receita com distrato = recebido do cliente − devolvido, na data do distrato.',
      '- **RET / imposto fixo**: −alíquota vigente no mês × soma da BASE do imposto, centro a centro, mês a mês. A base são as linhas de nível 2 acima dele marcadas em Máscaras › Informar histórico; sem marcação, todas as linhas acima. A regra de cada imposto desta empresa (com a base) está na lista de linhas abaixo.',
      '- **Grupo** = soma das linhas dele; **totalizadora** = soma de todas as linhas acima. Com alguma linha sem cálculo, aparece traço.',
      `- **AV %** (avaliação vertical): valor ÷ |${d.resultado.avaliacao_vertical?.descricao || 'linha base não configurada'}| (aba Configurações), da linha base para baixo. **AH %** (horizontal, na visão mês a mês): (mês − mês anterior) ÷ |mês anterior|; positivo = melhor para o resultado.`,
      '- **Sinal**: receitas positivas, custos e despesas negativos.',
      '',
      '## Configuração desta empresa',
      '### Linhas da DRE e a regra de cada uma',
      ...m.mascaras.map((x, i) => `${i + 1}. **${x.descricao}** (grupo ${grupos.get(x.parent_id) || '—'}; id ${x.id}) — ${d.regras.get(x.id)?.texto || '—'}`),
      `Totalizadoras: ${d.arvore.filter((g) => g.totalizadora).map((g) => g.descricao).join(', ') || 'nenhuma'}.`,
      '### Alíquotas do imposto fixo',
      ...(m.aliquotas.length ? m.aliquotas.map((h) => `- ${m.mascaras.find((x) => x.id === h.mascara_id)?.descricao || h.mascara_id}: ${String(h.aliquota).replace('.', ',')}% desde ${br(h.inicio)}`) : ['- nenhuma cadastrada']),
      `### Centros na DRE (${m.obras.length})`,
      ...m.obras.map((c) => {
        const info = d.centros.get(c.id) || {};
        const o = orcamentoEm(d, c.id, p.ate);
        const poc = m.pocEm ? m.pocEm(c.id, p.ate).poc : null;
        return `- ${rotulo(c)} — ${info.natureza || 'sem natureza'}; plano de contas ${info.plano_proprio ? 'próprio' : 'Global'}; orçamento vigente ${o.versao ? `R$ ${o.total.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} (versão de ${br(o.versao)})` : 'nenhum'}${poc !== null && o.versao ? `; POC de Receita hoje ${pct(poc)}%` : ''}.`;
      }),
      '### Tipos de documento fora da DRE',
      ...((extras.documentos_fora || []).length ? extras.documentos_fora.map((x) => `- ${x.documento} — ${nomes.get(x.documento) || ''}`) : ['- nenhum (todo tipo de documento entra)']),
      '',
      '## De onde vem cada dado e quando foi atualizado',
      `Última gravação: contas a receber ${quando(extras.receber)}; contas a pagar ${quando(extras.pagar)}; extrato ${quando(extras.extrato)}; contratos ${quando(extras.contratos)}; unidades ${quando(extras.unidades)}.`,
      'Rotinas do Monitor de Integrações que alimentam a DRE:',
      ...fontes,
      '- **Unidades (Sienge)**: NÃO tem rotina no Monitor — só o botão da aba Unidades do DRE Gerencial. Sem ela, permuta nova e mudança de fração ideal/situação não entram.',
      'Orçamento, máscaras, plano de contas da DRE, alíquotas e ajustes são cadastros manuais de propósito (decisões da empresa).',
      '',
      '## Auditoria',
      '- **Excel de auditoria** (botão de download nas abas DRE/POC do DRE Gerencial e no dashboard): Roteiro com conferências automáticas, DRE recalculada em fórmulas a partir das bases e conferida com o sistema, DRE mês a mês por centro, Memória de Cálculo (linha × centro × mês: base × fator), POC por obra, Base Financeiro/Unidades/Correções/Orçamento linha a linha, Plano de Contas aplicado, Fora da DRE (com o motivo) e Parâmetros.',
      '- **dre_auditoria** faz as mesmas conferências aqui (bases × motor, POC recalculada, soma dos centros), traz os alertas dos dados e o que ficou fora da DRE.',
      '',
      '## Glossário',
      '- **POC** (percentual de obra concluída): na receita, custo incorrido ÷ orçamento. Base da receita das incorporadoras (OCPC 01 / CPC 47 no Brasil).',
      '- **Fração ideal**: a parte de cada unidade no terreno/empreendimento (soma 100% na obra). Base da POC de Despesa.',
      '- **CIV**: custo dos imóveis vendidos. **REF / Resultado a apropriar**: receita já vendida que falta reconhecer − custo que falta gastar na proporção do vendido.',
      '- **VGV**: valor geral de vendas (vendido + permutas + estoque estimado). **Distrato**: cancelamento do contrato; estorna a receita e devolve o custo.',
      '- **RET**: regime especial de tributação do patrimônio de afetação (alíquota sobre a receita).',
      '',
      '## Qual ferramenta usar',
      '- A DRE do período (consolidado, por centro, mês a mês, AV %, AH %, comparação com o ano anterior): **dre_demonstrativo**.',
      '- "Como chegou nesse número?" de qualquer linha, grupo ou total, num centro ou no consolidado (fórmula, base × fator, avanço × vendas novas, POC usada, os lançamentos/contratos/parcelas que formam a base, exemplo): **dre_explicar_numero**.',
      '- A POC de cada obra (orçamento, custo, frações, unidades, a conta de cada linha, resultado a apropriar, mês a mês): **dre_poc**.',
      '- Lançamentos do Financeiro que formam a DRE (por linha, centro, natureza, fornecedor, mês; ajustados e criados à mão): **dre_lancamentos**. Contratos, distratos, permutas e estoque: **dre_unidades**.',
      '- O que ficou fora da DRE e por quê (teste de completude): **dre_fora_da_dre**. Conferências, alertas e fontes: **dre_auditoria**.',
      '- O dashboard Demonstração do Resultado (8 indicadores com etiquetas, para onde foi a receita, de onde veio, quem gera resultado, mês a mês, carteira POC): **dre_painel**. Cenários (vendas, avanço de obra, orçamento, estoque, despesas): **dre_simular**.',
      '- A **Projeção da DRE** (aba Projeções: o orçamento da DRE por centro; colunas Projetado e Desvio % da aba DRE e do dashboard): comece por **dre_projecao_guia** (FAQ da tela e regras); depois dre_projecao_orcamentos, dre_projecao_premissas, dre_projecao_explicar, dre_projecao_desvio e dre_projecao_auditoria.',
      '',
      '## Como responder',
      '- Diga sempre o período e o escopo (consolidado ou centros). O padrão é 1º de janeiro do ano até hoje, como a tela.',
      '- Para explicar um número, mostre a conta (base × fator, véspera e fim), separe avanço de obra e vendas novas, cite a POC e de onde ela veio, e dê o exemplo do centro que mais pesa.',
      '- Os valores batem com a aba DRE do DRE Gerencial e com o dashboard; se algo divergir, rode dre_auditoria.',
      '',
      '## Dashboard Demonstração do Resultado — Sumário da tela',
      ...ABAS_SUMARIO.map((aba) =>
        [`### ${aba.titulo}`, aba.resumo, ...aba.blocos.map((b) => `**${b.titulo}**\n${b.texto ? textoSimples(b.texto) : b.itens.map((i) => `- ${textoSimples(i)}`).join('\n')}`)].join('\n')
      ),
    ];
    return md.join('\n');
  }),
};

module.exports = guia;
