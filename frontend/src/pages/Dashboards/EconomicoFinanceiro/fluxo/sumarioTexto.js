// Textos do Sumário das análises do painel do Fluxo de Caixa — fonte única: a janela Sumário da tela
// (sumario.jsx) e a ferramenta dfc_painel_fluxo_caixa do MCP (cópia gerada por
// backend/scripts/sincronizar-painel-fluxo.js) leem daqui. Os cálculos descritos são os de modelo.js e
// analise.js — mude o texto junto se mudar a regra.
// Marcação: **negrito**; {tom|texto} = etiqueta colorida (tom: good, warn, crit, info) e
// {flag|texto} / {flagw|texto} = selo azul / selo de alerta, como na tela.

export const ABAS_SUMARIO = [
  {
    id: 'filtros',
    titulo: 'Filtros do painel',
    resumo: 'O que cada filtro da barra muda no painel.',
    blocos: [
      {
        titulo: 'Filtros',
        itens: [
          '**Empresa** — a empresa do DFC Construtoras analisada.',
          '**Histórico** — quantos meses **antes** do mês atual entram como realizado (6m, 1m ou digite de 1 a 36). Começa em 1.',
          '**Horizonte** — quantos meses de projeção, **contando o mês atual** (6m, 9m ou digite). Começa em 6: com o mês atual em out/26, vai até mar/27.',
          '**Centro de custo** — limita o painel aos centros marcados. Sem nenhum marcado, entram todos os centros com "Projeta DFC".',
        ],
      },
      {
        titulo: 'Bom saber',
        itens: [
          'Clicar numa empresa (Fôlego de cada SPE) ou num centro (Quem gera e quem consome caixa) aplica o filtro de centro sozinho; clicar de novo volta ao consolidado.',
          'O botão de download gera o Excel do DFC (fluxo, saldos, bases do realizado e do projetado e dossiê da Projeção CEF) com os mesmos filtros da barra.',
          'Saldos das contas, carteira a receber/pagar e inadimplência são sempre da empresa inteira — não dependem do filtro de centro.',
          'Os dados recarregam sozinhos a cada 30 minutos com a tela aberta.',
        ],
      },
    ],
  },
  {
    id: 'indicadores',
    titulo: 'Indicadores',
    resumo: 'Os 8 cards do topo: a fotografia do caixa hoje e dos próximos meses.',
    blocos: [
      {
        titulo: 'Cada card',
        itens: [
          '**Caixa hoje** — saldo de abertura do mês atual nas contas com "Projeta DFC" (o Saldo inicial do mês atual na tabela). "Aplicado" é a parte em contas do tipo **Investimento**.',
          '**Mínimo projetado** — o menor saldo de fim de mês dentro do horizonte, o mês em que ele acontece e quanto é menor que hoje.',
          '**Resultado médio · próximos 6 meses** — média do Resultado do mês projetado (todas as entradas menos todas as saídas) nos 6 primeiros meses do horizonte, e o mês em que o saldo fica abaixo do colchão, se ficar.',
          '**Fluxo operacional · últimos meses** — soma do realizado (entradas + saídas) do Fluxo de Caixa Operacional nos meses do Histórico.',
          '**Dívida PJ Caixa** — saldo devedor do crédito PJ (Projeção CEF) no último mês fechado, somando as obras, e até onde ele vai no fim da projeção.',
          '**A receber em 90 dias** — parcelas a receber em aberto no Sienge que vencem do início do mês atual até 3 meses à frente; embaixo, toda a carteira a vencer.',
          '**Inadimplência** — valor vencido ÷ (vencido + a vencer) das parcelas a receber em aberto.',
          '**Maior concentração de caixa** — quanto do caixa está na empresa (SPE) com o maior saldo.',
        ],
      },
      {
        titulo: 'O colchão',
        texto:
          'O colchão é 1 mês de saídas operacionais: a média mensal das saídas do Fluxo de Caixa Operacional projetadas no horizonte. É a referência de "caixa mínimo seguro" usada nos cards e na Trajetória do caixa.',
      },
      {
        titulo: 'Como ler as etiquetas',
        itens: [
          '{good|Verde} situação confortável — {warn|Amarelo} atenção — {crit|Vermelho} crítico — {info|Azul} informativo.',
          'Caixa hoje: crítico ("Abaixo do colchão") quando o caixa é menor que o colchão.',
          'Mínimo projetado: crítico abaixo do colchão; atenção abaixo de 2 colchões.',
          'Resultado médio: crítico se o saldo fura o colchão nos próximos 3 meses; atenção se a média é negativa.',
          'Fluxo operacional: atenção ("Consome caixa") quando o realizado do histórico é negativo.',
          'Inadimplência: atenção acima de 3%; crítico acima de 8%.',
          'Maior concentração: atenção quando uma empresa tem mais de 40% do caixa.',
          'Dívida PJ: "Crescente" quando o saldo no fim da projeção passa de 1,5 vez o de hoje.',
        ],
      },
    ],
  },
  {
    id: 'detalhamento',
    titulo: 'Detalhamento do fluxo de caixa',
    resumo: 'A mesma tabela da aba DFC do DFC Construtoras, no período dos filtros.',
    blocos: [
      {
        titulo: 'O que mostra',
        itens: [
          'Saldo inicial › grupos (máscara nível 1) › Entradas e Saídas › linhas (máscara nível 2) › naturezas › Resultado do mês › Saldo final.',
          'Até o mês atual, cada mês tem duas colunas: Realizado (extrato bancário das contas com Projeta DFC) e Projetado (última versão salva do Orçamento). Depois do mês atual, só Projetado.',
          'O Realizado do mês atual vem até o dia da última atualização do extrato (Orçamentos › Nova versão › Saldos das Contas) — é parcial até o mês fechar.',
          'O mês atual fica destacado em azul.',
        ],
      },
      {
        titulo: 'Como usar',
        itens: [
          'Clique na seta de uma linha para abrir ou fechar o nível de baixo. O quadro cresce conforme você abre, até a altura da tela.',
          'Clique num valor de natureza para abrir o Detalhamento: os lançamentos (realizado) ou de onde veio o valor projetado (Aging, Orçamento Empresarial, valor informado ou Projeção CEF).',
          'O ícone no canto direito do título abre a tabela em tela cheia (Esc para sair).',
        ],
      },
    ],
  },
  {
    id: 'trajetoria',
    titulo: 'Trajetória do caixa e simulador',
    resumo: 'Para onde vai o saldo de caixa mês a mês — e o que acontece se as premissas piorarem.',
    blocos: [
      {
        titulo: 'O gráfico',
        itens: [
          '**Linha azul cheia** — saldo realizado no fim de cada mês do histórico. **Azul tracejada** — saldo projetado pelo Orçamento.',
          '**Laranja** — o mesmo projetado com os ajustes do simulador (só aparece quando o cenário muda alguma coisa).',
          '**Vermelha pontilhada** — o colchão (1 mês de saídas operacionais). O fundo cinza marca os meses projetados.',
          'O título resume o ponto mais baixo do Orçamento no horizonte. Passe o mouse para ver os valores de cada mês.',
        ],
      },
      {
        titulo: 'O simulador (não altera nada no sistema)',
        itens: [
          '**Orçamento** — sem ajustes. **Conservador** (o que abre por padrão) — estrutura fixa no ritmo real, obra 10% mais cara e entradas da obra escolhida 3 meses atrasadas. **Estresse** — o conservador com obra 25% mais cara e 15% menos receita de vendas.',
          '**Estrutura fixa no ritmo real** — quando o Orçamento projeta Pessoal e Administrativo abaixo da média realizada (últimos meses do histórico), usa a média.',
          '**Estouro no custo de obra** — aumenta as saídas das linhas de construção/obra na porcentagem escolhida.',
          '**Queda na receita de vendas** — reduz as entradas da linha Receita de Vendas.',
          '**Atrasar entradas de** — empurra as entradas projetadas da obra escolhida (por padrão, a de maior entrada num mês) o número de meses escolhido; o que passa do horizonte sai do gráfico.',
        ],
      },
    ],
  },
  {
    id: 'entradas',
    titulo: 'Entradas e saídas operacionais',
    resumo: 'Quanto entra e quanto sai na operação, mês a mês.',
    blocos: [
      {
        titulo: 'O que mostra',
        itens: [
          'Barras azuis: entradas do Fluxo de Caixa Operacional. Barras vermelhas: saídas. Pontos pretos: o líquido do mês (entradas − saídas).',
          'Barras fortes são realizado; barras claras, projetado. A linha tracejada separa os dois.',
          'O Fluxo Operacional já inclui captação de financiamentos (repasses CEF) e serviço da dívida; aplicações e resgates ficam de fora.',
        ],
      },
      { titulo: 'Como usar', texto: 'Passe o mouse sobre um mês para ver entradas, saídas e líquido.' },
    ],
  },
  {
    id: 'folego',
    titulo: 'Fôlego de cada SPE',
    resumo: 'Se cada empresa (SPE) tivesse que se manter sozinha, até quando o caixa dela aguenta?',
    blocos: [
      {
        titulo: 'Como é calculado',
        itens: [
          'Ponto de partida: o saldo de hoje nas contas com Projeta DFC daquela empresa.',
          'Mês a mês soma o fluxo operacional projetado dos centros de custo dela — sem mútuos nem transferências entre empresas.',
          'Cada célula é o saldo projetado no fim do mês: vermelho = negativo, azul = positivo; quanto mais forte, maior o valor.',
        ],
      },
      {
        titulo: 'Como ler',
        itens: [
          '{crit|Zera em …} o primeiro mês em que o saldo fica negativo.',
          '{warn|Cai …%} não zera, mas o ponto mais baixo fica abaixo da metade do caixa de hoje.',
          '{good|Cobre} o caixa da empresa cobre o fluxo do horizonte.',
          'A célula com contorno é o mês de menor saldo. A linha "Soma" junta todas as empresas.',
        ],
      },
      {
        titulo: 'Como usar',
        itens: [
          'Ordene por Risco (quem zera primeiro), Caixa hoje ou Nome; "Só as que zeram" esconde as demais.',
          'Clique numa empresa para filtrar o painel inteiro pelos centros dela; clique de novo para voltar.',
        ],
      },
    ],
  },
  {
    id: 'quemgera',
    titulo: 'Quem gera e quem consome caixa',
    resumo: 'Quais centros de custo colocam dinheiro no caixa e quais tiram.',
    blocos: [
      {
        titulo: 'O que mostra',
        itens: [
          'Para cada centro com Projeta DFC: o fluxo operacional líquido realizado nos meses do Histórico e o projetado nos meses do Horizonte.',
          'A barra mostra o projetado: azul para a direita gera caixa; vermelha para a esquerda consome. A lista vem do que mais gera para o que mais consome.',
        ],
      },
      {
        titulo: 'Etiquetas',
        itens: [
          '{flag|CEF} a obra tem Projeção CEF ativa (Parâmetros cadastrados).',
          '{flagw|CEF fora} a obra tem contrato Caixa e recebeu repasse no histórico, mas não tem Projeção CEF — os repasses futuros podem estar faltando no Orçamento.',
        ],
      },
      { titulo: 'Como usar', texto: 'Clique numa linha para filtrar o painel por aquele centro; clique de novo para voltar.' },
    ],
  },
  {
    id: 'carteira',
    titulo: 'Carteira e liquidez',
    resumo: 'Onde está o dinheiro hoje e o que há para receber e pagar.',
    blocos: [
      {
        titulo: 'Os números',
        itens: [
          '**Liquidez imediata** — saldo das contas correntes (que não são do tipo Investimento).',
          '**Em aplicações** — saldo das contas do tipo Investimento (cadastro das contas correntes do DFC Construtoras).',
          '**A receber a vencer** — parcelas a receber em aberto no Sienge ainda não vencidas.',
          '**A pagar em aberto** — parcelas a pagar em aberto no Sienge (vencidas + a vencer).',
        ],
      },
      {
        titulo: 'O gráfico',
        texto:
          'Todas as contas com Projeta DFC e o saldo de abertura do mês atual, da maior para a menor: azul claro = Investimento, azul escuro = conta corrente. Passe o mouse para ver empresa, número e tipo da conta.',
      },
    ],
  },
  {
    id: 'orcamento',
    titulo: 'O Orçamento erra para qual lado?',
    resumo: 'Compara o que aconteceu com o que o Orçamento previa para os mesmos meses.',
    blocos: [
      {
        titulo: 'Como é calculado',
        itens: [
          'Para cada linha do Fluxo Operacional, soma o realizado e o projetado (versão atual do Orçamento) nos meses do Histórico.',
          'Desvio = realizado ÷ projetado − 1. Aparecem as 8 linhas com a maior diferença em reais (só as que somam mais de R$ 20 mil).',
        ],
      },
      {
        titulo: 'Como ler',
        itens: [
          'Vermelho = desfavorável: saída maior que a prevista ou entrada menor. Azul/verde = favorável.',
          'Um desvio que se repete mês a mês indica que a premissa do Orçamento daquela linha precisa de ajuste.',
          'Com Histórico de 1 mês a comparação é curta — aumente o Histórico para ver a tendência.',
        ],
      },
    ],
  },
  {
    id: 'saidas',
    titulo: 'Maiores saídas operacionais',
    resumo: 'Para quem foi a maior parte do dinheiro no período.',
    blocos: [
      {
        titulo: 'O que mostra',
        itens: [
          'Os 10 favorecidos com mais pagamentos no Fluxo Operacional realizado, nos meses do Histórico (respeita o filtro de centro).',
          'Vermelho = custo de obra (linhas de construção/obra); cinza = demais saídas.',
          'Passe o mouse para ver o total pago, o número de lançamentos e a linha do fluxo.',
        ],
      },
    ],
  },
  {
    id: 'divida',
    titulo: 'Dívida PJ da Caixa',
    resumo: 'O financiamento à produção (PJ) de cada obra com Projeção CEF.',
    blocos: [
      {
        titulo: 'Os números de cada obra',
        itens: [
          'Saldo devedor no último mês fechado, teto do PJ, % da obra executada, juros ao mês, % de amortização e os juros no último mês da projeção.',
          'O gráfico mostra o saldo devedor ao longo de toda a projeção; a linha tracejada horizontal é o teto e a vertical, o mês de referência.',
        ],
      },
      {
        titulo: 'Unidades',
        itens: [
          'Azul: unidades já registradas (repasse feito). Azul escuro: unidades com contrato na Caixa ainda sem registro. Cinza: unidades sem contrato.',
          'Os valores vêm da Projeção CEF gravada (aba Projeção CEF do DFC Construtoras).',
        ],
      },
    ],
  },
];

// Partes de um texto marcado: [{ t: 'texto' } | { b: 'negrito' } | { etiqueta: tom, t } | { selo: 'flag' | 'flagw', t }].
export function partesDoTexto(texto) {
  const partes = [];
  const re = /\*\*([^*]+)\*\*|\{(good|warn|crit|info|flag|flagw)\|([^}]+)\}/g;
  let ultimo = 0;
  let m;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push({ t: texto.slice(ultimo, m.index) });
    if (m[1]) partes.push({ b: m[1] });
    else if (m[2] === 'flag' || m[2] === 'flagw') partes.push({ selo: m[2], t: m[3] });
    else partes.push({ etiqueta: m[2], t: m[3] });
    ultimo = re.lastIndex;
  }
  if (ultimo < texto.length) partes.push({ t: texto.slice(ultimo) });
  return partes;
}

// O Sumário em Markdown (para o MCP): etiquetas viram [etiqueta vermelha: …] etc.
const NOME_TOM = { good: 'verde', warn: 'amarela', crit: 'vermelha', info: 'azul' };
export function textoSimples(texto) {
  return partesDoTexto(texto)
    .map((p) => (p.b ? `**${p.b}**` : p.etiqueta ? `[etiqueta ${NOME_TOM[p.etiqueta]}: ${p.t}]` : p.selo ? `[selo ${p.t}]` : p.t))
    .join('');
}
export function sumarioMarkdown(ids) {
  return ABAS_SUMARIO.filter((a) => !ids || ids.includes(a.id))
    .map((a) =>
      [
        `## ${a.titulo}`,
        a.resumo,
        ...a.blocos.map((b) => `### ${b.titulo}\n${b.texto ? textoSimples(b.texto) : b.itens.map((i) => `- ${textoSimples(i)}`).join('\n')}`),
      ].join('\n')
    )
    .join('\n\n');
}
