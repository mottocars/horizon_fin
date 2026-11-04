// Textos do Sumário das análises do Detalhamento Financeiro (janela Sumário e o "?" de cada seção). Os
// cálculos descritos são os de modelo.js — mude o texto junto se mudar a regra. Mesma marcação do Sumário do
// Fluxo de Caixa: **negrito**; {tom|texto} = etiqueta colorida (good, warn, crit, info).

export const ABAS_SUMARIO = [
  {
    id: 'base',
    titulo: 'Base e filtros',
    resumo: 'De onde vêm o realizado e o em aberto, e o que cada filtro muda.',
    blocos: [
      {
        titulo: 'Realizado',
        itens: [
          'Cada lançamento do **extrato bancário do Sienge** (rotina "Saldos das contas (Sienge)" do Monitor de Integrações) das contas com **"Projeta DFC"** marcado em DFC Construtoras › Contas Correntes — a mesma base do realizado do DFC. Conta sem "Projeta DFC" não entra.',
          'Entra tudo o que passou pelo banco: recebimentos e pagamentos de títulos e também o que não tem título (tarifas, aportes, distribuição de lucro, lançamentos de caixa…). Lançamento com título vem com o cliente ou fornecedor e o vencimento da parcela.',
          'Cada lançamento entra pelo **rateio** do extrato (centro de custo × plano de contas), o mesmo do DFC.',
        ],
      },
      {
        titulo: 'Em aberto',
        itens: [
          'As parcelas do **Aging List** que vencem no período e ainda têm saldo: contas a receber e a pagar, pelo **saldo corrigido**, no rateio do título. O vencido dentro do período também está aqui.',
          'Sem as **previsões financeiras** (o documento real que as substitui também está no Sienge — mesma regra do Aging e do DFC).',
        ],
      },
      {
        titulo: 'Entradas, saídas e o que fica de fora',
        itens: [
          '**Entradas** = contas a receber (recebido e a receber) + créditos do banco sem título. **Saídas** = contas a pagar (pago e a pagar) + débitos do banco sem título, como as tarifas. Descontos e tarifas lançados num recebimento ficam nele; retenções lançadas num pagamento, no pagamento.',
          'A **movimentação entre contas** — transferências e aplicações/resgates (as máscaras do DFC de transferências e de aplicações e resgates) — fica de fora de tudo: é dinheiro trocando de conta, não entrando nem saindo da empresa. O valor dela aparece embaixo do resumo. A inicialização de saldo do Sienge também fica de fora.',
        ],
      },
      {
        titulo: 'Filtros',
        itens: [
          '**Início** e **Fim** — o realizado com a data do lançamento entre as duas datas (no máximo até hoje) e o em aberto com o vencimento entre elas. Começa com o ano atual inteiro: o realizado de janeiro até hoje e o que vence até 31 de dezembro. Trocar as datas recarrega.',
          '**Centro de custo** — só as fatias do rateio nesses centros. Com todos marcados é o mesmo que sem filtro.',
          'O botão de download gera um Excel com o resumo, o mês a mês e cada fatia realizada e em aberto, com título, pessoa, vencimento, centro, plano de contas e rateio.',
        ],
      },
    ],
  },
  {
    id: 'resumo',
    titulo: 'Resumo',
    resumo: 'Entradas, saídas e resultado: o realizado, o em aberto e o total.',
    blocos: [
      {
        titulo: 'Como ler',
        itens: [
          '**Realizado** — o que já entrou e saiu do banco no período. **Em aberto** — o que vence no período e ainda não foi recebido nem pago (com quanto disso já está vencido). **Total** — os dois juntos.',
          '**Resultado** = entradas + saídas (as saídas são negativas). O **resultado total** é o resultado do período se tudo o que está em aberto for recebido e pago.',
        ],
      },
    ],
  },
  {
    id: 'grafico',
    titulo: 'Mês a mês',
    resumo: 'Entradas, saídas e resultado de cada mês, realizado e em aberto.',
    blocos: [
      {
        titulo: 'Como ler',
        itens: [
          'Para cima, as **entradas**: realizadas (azul) e, em cima delas, as em aberto (azul claro). Para baixo, as **saídas**: realizadas (vermelho) e em aberto (vermelho claro). A linha escura é o **resultado do mês** (realizado + em aberto).',
          'O em aberto fica no mês do vencimento — nos meses que já passaram, ele é o que venceu e ainda não foi pago nem recebido. A faixa cinza marca o mês atual.',
          'Passe o mouse num mês para ver os valores e o resultado acumulado; **Ver a tabela** mostra os números.',
        ],
      },
    ],
  },
  {
    id: 'sankey',
    titulo: 'De onde veio e para onde foi',
    resumo: 'O Sankey do dinheiro: de onde veio cada real e para onde foi.',
    blocos: [
      {
        titulo: 'Como ler',
        itens: [
          'Pelo **líquido de cada máscara do DFC** (Máscara DFC nível 2): com líquido positivo é **fonte** (esquerda); negativo, **destino** (direita), com as contas do plano de contas que mais pesaram ao lado. Fatia sem máscara entra pela conta do plano de contas.',
          '**Sobrou** = o que ficou das entradas. Quando as saídas passam das entradas, aparece à esquerda **Saiu do caixa que já existia**.',
          '**Realizado**, **Em aberto** ou **Total** (os dois juntos). **De cada R$ 100 que entraram**: quanto foi para cada destino e quanto sobrou.',
        ],
      },
    ],
  },
  {
    id: 'detalhamento',
    titulo: 'Detalhamento',
    resumo: 'Entradas e saídas lado a lado, do grupo até cada lançamento e parcela.',
    blocos: [
      {
        titulo: 'Como usar',
        itens: [
          'Como no Aging List: **entradas** e **saídas** lado a lado, com o mesmo agrupamento e a mesma busca. **Agrupar por**: até 3 níveis entre centro de custo, plano de contas, cliente/fornecedor, máscara do DFC e mês. Abaixo do último nível vêm os lançamentos realizados e as parcelas em aberto.',
          'Colunas: **Realizado**, **Em aberto** e **Total**. **Ordenar por** uma delas (também clicando no título da coluna).',
          'Cada item mostra a data (realizado) ou o vencimento (em aberto), o título/parcela, o cliente ou fornecedor e, embaixo, a origem e a conta, o documento, o vencimento ou os dias de atraso, o plano, o centro e — quando é rateado — a parte que está no grupo.',
          '**Buscar**: cliente, fornecedor, título, documento, descrição, centro ou plano de contas. O botão ao lado abre as duas tabelas em **tela cheia** (Esc para sair).',
        ],
      },
    ],
  },
];
