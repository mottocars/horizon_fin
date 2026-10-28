// Textos do Sumário das análises do Aging List (janela Sumário e o "?" de cada seção). Os cálculos
// descritos são os de modelo.js — mude o texto junto se mudar a regra. Mesma marcação do Sumário do
// Fluxo de Caixa: **negrito**; {tom|texto} = etiqueta colorida (good, warn, crit, info).

export const ABAS_SUMARIO = [
  {
    id: 'filtros',
    titulo: 'Filtros e base',
    resumo: 'De onde vêm os números e o que cada filtro da barra muda.',
    blocos: [
      {
        titulo: 'A base',
        itens: [
          '**A receber**: parcelas em aberto do contas a receber do Sienge (rotina "Base do contas a receber" do Monitor de Integrações). **A pagar**: parcelas em aberto do contas a pagar (rotina "Base do contas a pagar"). A data da última atualização de cada uma fica na barra.',
          '**Em aberto** = parcela com saldo maior que zero. O valor é sempre o **saldo corrigido** (correção monetária e juros do contrato, como o Sienge calcula); sem ele, o saldo simples.',
          '**Atraso** = dias entre o vencimento e hoje. A foto é de hoje: uma parcela que vence hoje e não foi baixada ainda está "Hoje"; amanhã passa a "vencido 1–7".',
          'Parcela rateada entre centros de custo ou naturezas entra em cada um com a fração dela; a soma das frações bate com o saldo da parcela.',
        ],
      },
      {
        titulo: 'Filtros',
        itens: [
          '**Empresa** — a empresa analisada.',
          '**Centro de custo** — só as fatias das parcelas nesses centros. O saldo bancário passa a ser o das contas das empresas (Sienge) donas dos centros marcados.',
          '**Previsões financeiras** — previsões de contratos de medição, de pedidos de compra e de pagamento/recebimento (quase sempre no a pagar). Ficam **fora** por padrão: quando o documento real chega, ele também entra no Sienge e contar os dois duplica o valor (mesma regra do DFC). O valor que ficou de fora aparece na barra.',
          'O botão de download gera um Excel com o resumo por faixa e todas as parcelas a receber e a pagar do escopo, com centro, natureza, faixa e dias de atraso.',
        ],
      },
    ],
  },
  {
    id: 'indicadores',
    titulo: 'Indicadores',
    resumo: 'Os 8 cards: a receber na linha de cima, a pagar na de baixo e o caixa na ponta.',
    blocos: [
      {
        titulo: 'Cada card',
        itens: [
          '**A receber / A pagar em aberto** — todo o saldo corrigido em aberto, com o número de parcelas e de clientes/fornecedores. Etiqueta: % vencido — {good|até 5%}, {warn|até 15%}, {crit|acima de 15%}.',
          '**Vencido a receber** — o que já passou do vencimento; quanto disso tem mais de 90 dias e o **atraso médio ponderado pelo valor** (parcela grande pesa mais). {crit|Atraso crônico} quando mais da metade do vencido tem mais de 90 dias; {warn|Cobrar} nos demais casos.',
          '**Vencido a pagar** — o mesmo para o contas a pagar. {crit|Pagamentos atrasados} quando o atraso é recente; {warn|Atraso antigo: revisar} quando mais de 70% tem mais de 90 dias — costuma ser título que já foi resolvido fora do Sienge ou está em disputa e precisa de baixa ou renegociação.',
          '**Entra / Sai nos próximos 15 dias** — vence de hoje até 14 dias à frente; embaixo, o que vence hoje e nos próximos 7 dias.',
          '**Caixa livre hoje** — do último dia com saldo em Operações › Saldo Contas Bancárias: contas de classificação de saldo **liberado**, menos os bloqueios registrados. Embaixo, o cheque especial dessas contas e o saldo bloqueado (classificações de saldo bloqueado + bloqueios).',
          '**Menor saldo · 15 dias** — o simulador no cenário Previsto (sem perdas nem atrasos): partindo do caixa livre, o menor saldo de fim de dia nos próximos 15 dias. {good|Caixa cobre}, {warn|Usa cheque especial} (negativo, mas dentro do limite) ou {crit|Falta caixa} (passa do limite).',
        ],
      },
    ],
  },
  {
    id: 'faixas',
    titulo: 'Escada de vencimentos',
    resumo: 'O aging clusterizado: a pagar e a receber lado a lado, da parcela mais vencida à mais distante.',
    blocos: [
      {
        titulo: 'As faixas',
        itens: [
          '**Vencido há**: mais de 180 dias, 91–180, 61–90, 31–60, 16–30, 8–15 e 1–7 dias. **Hoje**: vence hoje. **A vencer em**: 1–7, 8–15, 16–30, 31–60, 61–90, 91–180 e mais de 180 dias.',
          'As faixas curtas perto de hoje são as que mudam a decisão da semana (cobrar, pagar, segurar); as longas mostram o tamanho do problema (vencido antigo) ou da carteira futura (financiamentos).',
        ],
      },
      {
        titulo: 'Como ler',
        itens: [
          '**Líquido** = a receber − a pagar da faixa. Vermelho: na faixa, devo mais do que tenho a receber.',
          '**Caixa acumulado** (só de hoje em diante) = caixa livre de hoje + o líquido de cada faixa a vencer, acumulado. É o caixa se tudo for pago e recebido exatamente no vencimento — se ficar negativo numa faixa, falta dinheiro naquele prazo mesmo sem nenhuma inadimplência.',
          '**Posição líquida** (todo o receber − todo o pagar), **Vencido líquido** e **Líquido de hoje a 30 dias** resumem a escada.',
          'As barras usam a mesma escala; as das pontas (+180 dias) costumam ser muito maiores e, quando passam da escala, aparecem com a ponta cortada (o valor está escrito ao lado).',
          'Clicar numa faixa filtra o **detalhamento** por ela; clicar de novo tira o filtro.',
        ],
      },
    ],
  },
  {
    id: 'simulador',
    titulo: 'Caixa dos próximos dias',
    resumo: 'O simulador: partindo do saldo das contas de hoje, o caixa dia a dia pagando e recebendo o que vence.',
    blocos: [
      {
        titulo: 'Como é calculado',
        itens: [
          '**Saldo de partida**: o caixa livre (contas de saldo liberado menos bloqueios) ou todas as contas, do último dia com saldo em Saldo Contas Bancárias.',
          'Cada dia do horizonte recebe as parcelas a receber e paga as parcelas a pagar que vencem nele. **Vencimento no sábado ou domingo cai na segunda-feira.** Feriados não são tratados.',
          'O que já está vencido **não entra** no cenário Previsto: só pelos ajustes de recuperar (receber) e pagar vencidos.',
          'O gráfico mostra as entradas e as saídas de cada dia, a linha do saldo no fim do dia, o mínimo de segurança e — se o saldo ficar negativo — o piso do cheque especial. Clique num dia (no gráfico ou no dia a dia) para ver as parcelas dele.',
        ],
      },
      {
        titulo: 'Ajustes do cenário',
        itens: [
          '**Não receber** — % das entradas previstas que não entra (inadimplência esperada).',
          '**Atrasar os recebimentos** — dias de atraso em todas as entradas; o que passa do horizonte sai da conta.',
          '**Recuperar do vencido** — % do vencido a receber de até 90 dias que entra, dividido igualmente pelos dias úteis do período.',
          '**Permutas e "Não cobrar" não entram** — condições de pagamento que não viram dinheiro no banco (ligado por padrão).',
          '**Pagar do vencido** — % do vencido a pagar de até 90 dias quitado no 1º dia útil (o mais antigo costuma estar em disputa ou já resolvido fora do Sienge).',
          '**Adiar os pagamentos** — dias de folga negociados com fornecedores.',
          '**Aporte / captação** — dinheiro novo no primeiro dia; **Mínimo de segurança** — o saldo que não quero perfurar. **Necessidade de caixa** = quanto falta para o menor saldo não ficar abaixo do mínimo.',
          'Cenários prontos: **Previsto** (tudo no vencimento), **Conservador** (10% de perda, 5 dias de atraso, paga metade dos vencidos) e **Estresse** (30% de perda, 10 dias de atraso, paga todos os vencidos de até 90 dias).',
        ],
      },
    ],
  },
  {
    id: 'detalhamento',
    titulo: 'Aging por centro, natureza e pessoa',
    resumo: 'A tabela que desce do grupo até a parcela (título e parcela do Sienge).',
    blocos: [
      {
        titulo: 'Como usar',
        itens: [
          '**Carteira**: a receber ou a pagar. **Agrupar por**: até 3 níveis entre centro de custo, natureza, cliente/fornecedor, empresa, condição de pagamento (só a receber) e tipo de documento. Abaixo do último nível vêm as parcelas.',
          'Cada parcela mostra o **título/parcela** (bill e installment do Sienge), o número da parcela, o documento, o vencimento, a unidade e a condição (a receber) e as etiquetas **Inadimplente**, **Sub judice** e **Previsão**.',
          '**Faixas**: resumidas (vencido +180, 91–180, 31–90, 1–30, hoje e a vencer 1–30, 31–90, +90) ou todas as 15. Clicar no cabeçalho de uma faixa filtra a tabela por ela.',
          '**Ordenar por**: maior vencido, maior total, maior atraso médio ou nome. **Buscar**: nome, título, documento, unidade, centro ou natureza.',
          'A cor de cada célula mostra o peso da faixa no total da linha: vermelho no vencido, amarelo hoje, azul a vencer.',
        ],
      },
    ],
  },
  {
    id: 'maiores',
    titulo: 'Maiores devedores e credores',
    resumo: 'Os 10 clientes que mais devem e os 10 fornecedores a quem mais devo.',
    blocos: [
      {
        titulo: 'Como ler',
        itens: [
          '**Vencido**: o saldo vencido de cada um, com o maior atraso — é a lista de cobrança (a receber) e de negociação (a pagar).',
          '**Vence em 30 dias**: o que vence de hoje a 29 dias, com o próximo vencimento — é onde concentrar a confirmação de recebimento e a programação de pagamento.',
          '**Concentração nos 10 maiores**: quanto do total eles representam. Concentração alta no a receber é risco (depender de poucos); no a pagar, é poder de negociação.',
        ],
      },
    ],
  },
];
