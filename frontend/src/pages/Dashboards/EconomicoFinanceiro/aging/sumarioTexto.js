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
          '**A receber**: parcelas em aberto do contas a receber do Sienge (rotina "Base do contas a receber" do Monitor de Integrações). **A pagar**: parcelas em aberto do contas a pagar (rotina "Base do contas a pagar").',
          '**Em aberto** = parcela com saldo maior que zero. O valor é sempre o **saldo corrigido** (correção monetária e juros do contrato, como o Sienge calcula); sem ele, o saldo simples.',
          '**Atraso** = dias entre o vencimento e hoje. A foto é de hoje: uma parcela que vence hoje e não foi baixada ainda está "Hoje"; amanhã passa a "vencido 1–7".',
          'Parcela rateada entre centros de custo ou contas do plano de contas entra em cada um com a fração dela; a soma das frações bate com o saldo da parcela.',
        ],
      },
      {
        titulo: 'Filtros',
        itens: [
          '**Empresa** — a empresa analisada.',
          '**Início** e **Fim** — o período do **vencimento** das parcelas: só entram as que vencem entre as duas datas, vencidas ou a vencer. Começa com o ano atual inteiro (1º de janeiro a 31 de dezembro). Vale para a tela toda: cards, escada, detalhamento, simulador, maiores e o Excel.',
          '**Centro de custo** — só as fatias das parcelas nesses centros. O saldo bancário passa a ser o das contas das empresas (Sienge) donas dos centros marcados.',
          'O botão de download gera um Excel com o resumo por faixa e todas as parcelas a receber e a pagar do escopo (com todos os filtros), com centro, plano de contas, faixa e dias de atraso.',
        ],
      },
      {
        titulo: 'Botão Filtros',
        itens: [
          'Abre o painel de filtros abaixo da barra (clique de novo ou no X para recolher). Com ele fechado, os filtros valendo aparecem em etiquetas — o X de cada uma tira aquele filtro — e o botão mostra quantos estão valendo.',
          '**Histórico** e **Horizonte** — o período da barra em meses a partir do mês atual: Histórico = quantos meses para trás (0 = desde o 1º dia do mês atual), Horizonte = quantos meses para frente (0 = até o último dia do mês atual). Mudar os meses muda o Início e o Fim da barra, e mudar as datas da barra atualiza os meses. Se a data não for o começo (ou o fim) de um mês, o campo fica vazio até você informar os meses.',
          '**Tipo de documento** e **Plano de contas** — valem para o a receber e o a pagar. O plano de contas filtra cada fatia do rateio.',
          '**Cliente** filtra só o a receber; **Fornecedor**, só o a pagar — dá para olhar o que um cliente deve e o que se deve a um fornecedor ao mesmo tempo.',
          '**Previsão financeira** — previsões de contratos de medição, de pedidos de compra e de pagamento/recebimento (quase sempre no a pagar). **Não** (padrão): ficam de fora — quando o documento real chega, ele também entra no Sienge e contar os dois duplica o valor (mesma regra do DFC). **Sim**: só as previsões. **Todas**: documentos e previsões juntos.',
          'As listas trazem tudo o que existe, tenha ou não parcela em aberto no período: as contas de resultado do plano de contas (Cadastros › Plano de Contas; as totalizadoras não entram), os tipos de documento de qualquer título (pago ou em aberto), os clientes do cadastro do Sienge e de qualquer título a receber e os fornecedores já consultados no Sienge e de qualquer título a pagar, sempre em ordem alfabética (marcar ou desmarcar não muda o item de lugar). **Limpar filtros** tira os do painel (o centro de custo da barra fica).',
          '**marcar todos** (em cada lista) marca a lista inteira — depois é só desmarcar um a um o que não quer ver ("Todos menos 3"). O filtro vira "todos, menos os desmarcados": o que aparecer depois no Sienge (cliente, fornecedor, tipo de documento ou conta nova) já entra, inclusive no filtro salvo. **limpar** volta a lista para sem filtro.',
        ],
      },
      {
        titulo: 'Filtros salvos',
        itens: [
          '**Gravar filtro** (no painel) guarda o Histórico e o Horizonte, o centro de custo e os filtros do painel com um nome. Gravar com um nome que já existe substitui o filtro. Ao aplicar um filtro salvo, o **Início e o Fim são recalculados** a partir do mês atual: "12 meses de histórico e 6 de horizonte" sempre mostra o período certo, em qualquer mês em que for aberto. Se ao gravar a data da barra não fechava um mês, aquele lado do período não é gravado e o filtro não mexe nele.',
          'A lista **Filtros salvos** da barra aplica o filtro escolhido. Ela mostra o nome enquanto os filtros forem iguais aos gravados; mexeu em algum, vira "Personalizado". Para excluir, aplique o filtro, abra o painel e use **Excluir**.',
          'Cada usuário tem os próprios filtros salvos, separados por empresa.',
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
          '**Caixa livre hoje** — o **Total liberado** do último dia com saldo em Operações › Saldo Contas Bancárias: tudo o que dá para usar no dia para pagar as contas. Nas contas de classificação de saldo **liberado**, o saldo menos os bloqueios registrados (só a parte positiva) + o limite restante do cheque especial (saldo negativo já sai do limite: −200 com limite 500 → 300). Embaixo, quanto desse valor é cheque especial.',
          '**Menor saldo · 15 dias** — o simulador no cenário Previsto (sem perdas nem atrasos): partindo do caixa livre, o menor saldo de fim de dia nos próximos 15 dias. {good|Caixa cobre}, {warn|Usa cheque especial} (o caixa próprio acaba e entra no cheque, mas não fica negativo) ou {crit|Falta caixa} (negativo: falta mesmo usando todo o cheque especial).',
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
          '**Saldo de partida**: o caixa livre (o Total liberado, com o cheque especial dentro) ou o liberado + o bloqueado, do último dia com saldo em Saldo Contas Bancárias.',
          'Cada dia do horizonte recebe as parcelas a receber e paga as parcelas a pagar que vencem nele. **Vencimento no sábado ou domingo cai na segunda-feira.** Feriados não são tratados.',
          'O que já está vencido **não entra**: o vencido a pagar fica de fora e o vencido a receber só entra pelo ajuste de recuperar.',
          'O gráfico mostra as entradas e as saídas de cada dia, a linha do saldo no fim do dia e — quando o saldo desce até ele — o valor do cheque especial que está dentro do saldo: abaixo dessa linha o caixa está usando o cheque; abaixo de zero, falta caixa. Clique num dia (no gráfico ou no dia a dia) para ver as parcelas dele.',
          '**Necessidade de caixa** = quanto falta para o menor saldo do período não ficar negativo, já usando todo o cheque especial.',
        ],
      },
      {
        titulo: 'Ajustes do cenário (recebimentos)',
        itens: [
          '**Não receber** — % das entradas previstas que não entra (inadimplência esperada).',
          '**Atrasar os recebimentos** — dias de atraso em todas as entradas; o que passa do horizonte sai da conta.',
          '**Recuperar do vencido** — % do vencido a receber de até 90 dias que entra, dividido igualmente pelos dias úteis do período.',
          '**Permutas e "Não cobrar" não entram** — condições de pagamento que não viram dinheiro no banco (ligado por padrão).',
          'Os pagamentos entram sempre como estão: tudo o que vence no período, no dia do vencimento.',
          'Cenários prontos: **Previsto** (tudo no vencimento), **Conservador** (10% de perda e 5 dias de atraso nos recebimentos) e **Estresse** (30% de perda e 10 dias de atraso).',
        ],
      },
    ],
  },
  {
    id: 'detalhamento',
    titulo: 'Aging por centro, plano de contas e pessoa',
    resumo: 'A tabela que desce do grupo até a parcela (título e parcela do Sienge).',
    blocos: [
      {
        titulo: 'Como usar',
        itens: [
          '**A receber** e **a pagar** lado a lado, com o mesmo agrupamento e a mesma busca. **Agrupar por**: até 3 níveis entre centro de custo, plano de contas, cliente/fornecedor, empresa, condição de pagamento (só no a receber; no a pagar esse nível é pulado) e tipo de documento. Abaixo do último nível vêm as parcelas.',
          'Cada parcela mostra o **título/parcela** (bill e installment do Sienge), o número da parcela, o documento, o vencimento, a unidade e a condição (a receber) e as etiquetas **Inadimplente**, **Sub judice** e **Previsão**.',
          'Colunas: **Vencido** (até ontem), **A vencer** (de hoje em diante) e **Total**. **Ordenar por**: maior vencido (padrão), maior a vencer ou maior total — também clicando no título da coluna, que fica marcado com a seta. Nas parcelas: por vencido, as mais atrasadas primeiro; por a vencer, as a vencer primeiro, da que vence antes; por total, da maior para a menor. Clicar numa faixa da escada de vencimentos filtra as duas tabelas por ela.',
          '**Buscar**: nome, título, documento, unidade, centro ou plano de contas. O botão ao lado da busca abre as duas tabelas em **tela cheia** (Esc ou o mesmo botão para sair).',
          'Parcela rateada entre centros ou contas do plano de contas aparece em cada um com a fração dela (a soma bate com o saldo).',
          'A cor de cada célula mostra o peso dela no total da linha: vermelho no vencido, azul no a vencer.',
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
