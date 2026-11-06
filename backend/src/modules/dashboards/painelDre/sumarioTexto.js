// GERADO por backend/scripts/sincronizar-painel-fluxo.js a partir de
// frontend/src/pages/Dashboards/EconomicoFinanceiro/dre/sumarioTexto.js — NÃO EDITE AQUI: edite lá e rode o script.
// Textos do Sumário das análises da Demonstração do Resultado (janela Sumário e o "?" de cada seção). Os
// cálculos descritos são os de modelo.js e do motor da DRE (backend dre-demonstrativo) — mude o texto junto
// se mudar a regra. Mesma marcação do Sumário do Fluxo de Caixa: **negrito**; {tom|texto} = etiqueta.

const ABAS_SUMARIO = [
  {
    id: 'filtros',
    titulo: 'Filtros e base',
    resumo: 'De onde vêm os números e o que cada filtro da barra muda.',
    blocos: [
      {
        titulo: 'A base',
        itens: [
          'É a **mesma DRE da aba DRE do DRE Gerencial** (Operações › DRE Gerencial), calculada pelo mesmo motor: as máscaras, o plano de contas DRE, os ajustes do Financeiro, as unidades e contratos do Sienge, as correções monetárias e o orçamento das obras. Os números batem com ela.',
          'Receitas das obras pelo **método da POC** (percentual de obra concluída): a venda entra na DRE conforme a obra é executada. Custos dos imóveis pela **fração vendida** (POC de Despesa).',
          'Só entram os centros de custo com **"Realiza DRE"** (aba Centros Custos do DRE Gerencial). As obras são os centros com natureza **Obra**.',
          'A DRE é do **realizado**: o período nunca passa de hoje.',
        ],
      },
      {
        titulo: 'Filtros',
        itens: [
          '**Empresa** — a empresa analisada.',
          '**Início** e **Fim** — os meses do período (começa no ano atual, de janeiro até o mês de hoje). O período sempre já desconta o que foi reconhecido antes dele: uma venda antiga só entra pelo avanço da obra no período.',
          '**Centro de custo** — só os centros marcados (vazio = todos com "Realiza DRE"). Vale para a tela toda, inclusive a comparação com o ano anterior. **Marcar todos** marca a lista inteira (com todos marcados é o consolidado, o mesmo que nenhum) — depois é só desmarcar o que não quer ver.',
          'A comparação é sempre com o **mesmo período do ano anterior** (ex.: jan a out/26 contra jan a out/25), com os mesmos filtros.',
          'O botão de **download** baixa o **Excel de auditoria** do período e dos centros da barra (o mesmo do DRE Gerencial): a DRE refeita em fórmulas a partir dos lançamentos e conferida com o sistema, a memória de cálculo linha × centro × mês, as POCs de cada obra, as bases linha a linha, o que ficou fora da DRE com o motivo e os alertas dos dados — e, com versão salva da projeção, as colunas Projetado e Desvio % e as abas da projeção (o gravado, a memória refeita em fórmulas, a POC e as premissas).',
        ],
      },
    ],
  },
  {
    id: 'indicadores',
    titulo: 'Indicadores',
    resumo: 'Os 8 números que resumem o resultado do período e o que ainda vem pela frente.',
    blocos: [
      {
        titulo: 'De onde vêm os nomes',
        texto:
          'Os resultados vêm das **totalizadoras** da aba Máscaras, na ordem de lá: a 1ª é a Receita Líquida, a 2ª o Lucro Bruto, a penúltima o EBITDA (com 4 ou mais) e o resultado final é a soma de todas as linhas. Os nomes nos cards são os que você deu às máscaras. Margens sempre sobre a **Receita Líquida**.',
      },
      {
        titulo: 'Os cards',
        itens: [
          '**Receita Líquida** — com a variação contra o mesmo período do ano anterior e quanto do que as obras reconheceram veio do avanço de obra (e não de venda nova). {good|Crescendo} acima de +5%; {info|Estável} entre −5% e +5%; {warn|Em queda} até −20%; {crit|Queda forte} abaixo.',
          '**Margem bruta** — Lucro Bruto ÷ Receita Líquida. {good|Saudável} a partir de 30% (as grandes incorporadoras de capital aberto rodam entre 28% e 35%); {info|Adequada} de 22% a 30%; {warn|Pressionada} abaixo de 22%; {crit|Negativa} abaixo de zero.',
          '**EBITDA** — o resultado operacional e a margem dele. {good|Saudável} a partir de 15%; {info|Adequada} de 8% a 15%; {warn|Pressionada} abaixo de 8%.',
          '**Resultado do período** — a soma de todas as linhas da DRE, com a margem líquida e a comparação com o ano anterior. {good|Saudável} a partir de 10%; {info|Adequada} de 3% a 10%; {warn|Pressionada} abaixo de 3%; {crit|Prejuízo} abaixo de zero.',
          '**Resultado a apropriar** — o que a carteira já vendida ainda vai dar de resultado até a entrega (o REF das incorporadoras): a receita vendida que falta reconhecer menos o **custo que ainda falta gastar na obra na proporção do que está vendido** (orçamento − custo incorrido, × fração vendida líquida). O custo já gasto das unidades em estoque não entra — ele vai junto com a receita delas quando forem vendidas. Obra sem orçamento fica de fora. {good|Margem garantida} a partir de 30%; {info|Margem adequada} de 15% a 30%; {warn|Margem apertada} abaixo de 15%.',
          '**Obra executada da carteira** — a POC de Receita média das obras, pesada pelo orçamento: custo incorrido ÷ orçamento. Ao lado, o avanço no período em pontos percentuais e o orçamento que ainda falta executar.',
          '**Vendas líquidas** — contratos assinados no período menos os distratos do período (valor e unidades).',
          '**Estoque a vender** — unidades sem contrato ativo nem permuta, pelo valor estimado (ticket médio do tipo da unidade, aba Unidades), e quanto isso é do VGV. {good|Quase vendido} abaixo de 10%; {warn|Estoque alto} acima de 30%.',
        ],
      },
    ],
  },
  {
    id: 'dre',
    titulo: 'Demonstração do resultado',
    resumo: 'A DRE completa, com as máscaras, o consolidado e cada centro de custo.',
    blocos: [
      {
        titulo: 'O que é',
        itens: [
          'É a **aba DRE do DRE Gerencial**, aqui dentro: as linhas de nível 1 e 2 das máscaras, o **Consolidado** (com a AV %, a avaliação vertical da aba Configurações) e uma coluna por centro de custo.',
          'Clique no **nome de um centro** para ver ele mês a mês, com a **AH %** (avaliação horizontal: a variação de cada mês sobre o anterior).',
          'Bolinhas **PR** (verde) e **PD** (vermelha): a linha passa pela POC de Receita ou pela POC de Despesa.',
          'O botão de **tela cheia** abre a grade na tela inteira (Esc para sair).',
        ],
      },
    ],
  },
  {
    id: 'sankey',
    titulo: 'Para onde foi a receita',
    resumo: 'O caminho de cada real reconhecido no período: de onde veio, para onde foi e o que sobrou.',
    blocos: [
      {
        titulo: 'Como ler',
        itens: [
          '**À esquerda**, de onde veio: cada linha **positiva** da DRE (venda de imóveis, permutas, correção monetária, receita com distratos, estorno de custo, receitas financeiras…). Linhas muito pequenas (abaixo de 1,2% do total) vão juntas em "Outras entradas".',
          '**No meio**, o total que entrou (100%).',
          '**À direita**, para onde foi: cada grupo de nível 1 com o que ele consumiu (as linhas **negativas** dele) e, por último, o **resultado** que sobrou. Grupos com mais de uma linha se abrem na última coluna.',
          'A espessura de cada faixa é o valor; passe o mouse para ver valor e percentual. Passar o mouse num bloco destaca só as faixas dele.',
          'É a visão **bruta**: positivos de um lado, negativos do outro (um estorno de custo aparece como entrada, não abatido do custo). Com **prejuízo**, ele entra pela esquerda para fechar a conta.',
        ],
      },
      {
        titulo: 'De cada R$ 100',
        texto: 'A faixa embaixo resume o diagrama: de cada R$ 100 que entraram, quanto foi para impostos, custo das obras, despesas e quanto sobrou de resultado.',
      },
    ],
  },
  {
    id: 'simulador',
    titulo: 'Simulador',
    resumo: 'O resultado do período refeito com outras premissas, pela mesma lógica da POC. Nada é gravado.',
    blocos: [
      {
        titulo: 'As alavancas',
        itens: [
          '**Vendas do período** — mais ou menos contratos assinados no período: a receita deles entra pela POC de hoje e o custo da fração vendida a mais entra no CIV (e nas despesas com POC, como a comissão).',
          '**Avanço de obra a mais** — obra executada a mais (pontos percentuais da POC de Receita): toda a carteira vendida reconhece mais receita, e o custo gasto a mais entra no CIV pela fração vendida (o estorno devolve a parte distratada).',
          '**Revisão do orçamento** — orçamento de obra maior derruba a POC (custo ÷ orçamento) e a receita reconhecida recua na mesma proporção; menor, sobe.',
          '**Vender estoque agora** — parte do estoque vendida pelo valor estimado: receita × POC de hoje e o custo dessa fração no CIV. Obra sem orçamento fica de fora (a POC dela é 0: a venda só traria custo).',
          '**Despesas operacionais** — as despesas sem POC entre o Lucro Bruto e o EBITDA (administrativas, marketing…).',
          'O imposto fixo (RET) acompanha pela **alíquota efetiva** do período sobre o que está acima dele.',
        ],
      },
      {
        titulo: 'Cenários prontos',
        itens: [
          '**Realizado** — tudo zerado: o que de fato aconteceu.',
          '**Conservador** — vendas −15%, orçamento +5%, despesas +5%.',
          '**Estresse** — vendas −30%, orçamento +10%, despesas +10%.',
          '**Aceleração** — obra +10 p.p. e 25% do estoque vendido.',
        ],
      },
      {
        titulo: 'A ponte',
        texto:
          'O gráfico vai do resultado realizado ao do cenário: cada barra é o efeito de uma alavanca (já com o RET). Avanço de obra e revisão do orçamento mexem na mesma POC; o que eles fazem juntos além da soma aparece em "Obra × orçamento juntos".',
      },
    ],
  },
  {
    id: 'mensal',
    titulo: 'Resultado mês a mês',
    resumo: 'A Receita Líquida, o Lucro Bruto e o resultado de cada mês do período, contra o ano anterior.',
    blocos: [
      {
        titulo: 'Como ler',
        itens: [
          'Barras azuis: Receita Líquida do mês. Barras verdes: Lucro Bruto. Pontos: o resultado do mês (vermelho quando negativo).',
          'O traço cinza é a Receita Líquida do **mesmo mês do ano anterior**.',
          'Cada mês desconta o que foi reconhecido antes dele: somando os meses dá o período.',
        ],
      },
    ],
  },
  {
    id: 'origem',
    titulo: 'De onde veio a receita',
    resumo: 'A Receita Bruta do período aberta pelo que a gerou.',
    blocos: [
      {
        titulo: 'As partes',
        itens: [
          '**Avanço de obra sobre vendas anteriores** — o que já estava vendido antes do período × o quanto a obra avançou nele. É receita que já estava contratada e vira resultado conforme a obra anda.',
          '**Vendas do período** — os contratos assinados no período × a POC de hoje (a parte da obra que já está pronta entra de uma vez).',
          '**Permutas**, **correção monetária**, **estorno de receita** (distratos, negativo) e as linhas sem POC (receita com distratos) vêm em seguida.',
          '**Demais centros** — o que vem de centros com "Realiza DRE" que não são obras.',
        ],
      },
      {
        titulo: 'Por que importa',
        texto:
          'Uma receita que vem quase toda do avanço de obra é de **boa qualidade** (já está vendida), mas depende do ritmo da obra. Uma receita puxada por vendas novas mostra tração comercial — e entra na DRE só na proporção do que já foi construído.',
      },
    ],
  },
  {
    id: 'centros',
    titulo: 'Quem gera resultado',
    resumo: 'Cada centro de custo no período, do que mais gera ao que mais consome.',
    blocos: [
      {
        titulo: 'Como ler',
        itens: [
          'Receita Líquida, margem bruta e o resultado de cada centro com "Realiza DRE", do maior resultado ao menor. A barra mostra o resultado (azul positivo, vermelho negativo).',
          'Centros que não são obra aparecem com o selo {flagw|ADM}: só têm despesa e entram no consolidado consumindo resultado.',
          'Clique numa linha para filtrar o painel inteiro por aquele centro; clique de novo para voltar ao consolidado.',
        ],
      },
    ],
  },
  {
    id: 'carteira',
    titulo: 'Carteira de obras pela POC',
    resumo: 'O rastreio da POC de cada obra: o que já foi feito e o que falta fazer.',
    blocos: [
      {
        titulo: 'As colunas',
        itens: [
          '**Obra executada** — a POC de Receita: custo incorrido ÷ orçamento vigente (aba Orçamento), até 100%. A parte clara é o que já estava executado no início do período; a azul, o avanço no período.',
          '**Vendido (líquido)** — a fração ideal vendida menos a distratada (POC de Despesa líquida). A parte laranja é o que foi vendido no período.',
          '**Receita no período** — o que a obra reconheceu na DRE no período (linhas com POC de Receita).',
          '**Receita a apropriar** — a receita já vendida que ainda vai entrar conforme a obra avança.',
          '**Resultado a apropriar** — receita a apropriar menos o custo que ainda falta gastar na obra × a fração vendida líquida, com a margem sobre a receita a apropriar. Sem orçamento não dá para calcular.',
          '**Obra a executar** — orçamento menos o custo incorrido. {crit|estourada}: o custo já passou do orçamento (a POC fica travada em 100% e o custo a mais não tem receita para cobrir).',
          '**Estoque** — unidades a vender e o valor estimado delas.',
        ],
      },
      {
        titulo: 'Atenção na leitura',
        itens: [
          'A receita entra pela **obra executada** e o custo pela **fração vendida**. Numa obra muito vendida e no meio da construção, o custo já gasto das unidades vendidas está quase todo na DRE e boa parte da receita ainda não — a margem do período fica baixa e a margem a apropriar, alta. Isso se equilibra até a entrega.',
          'Uma obra com custo acima do orçamento fica com a POC travada em 100%: vale revisar o orçamento (aba Orçamento).',
          'Obra sem orçamento não reconhece receita (POC 0%).',
        ],
      },
      {
        titulo: 'Mais detalhe',
        itens: [
          'Clique numa obra para ver a **evolução mês a mês** (obra executada × vendido) e a **conta da receita**: acumulado × POC = reconhecido; menos o que já tinha sido reconhecido antes = o do período.',
          '**Rastreio completo** abre a aba POC do DRE Gerencial em tela cheia, com as unidades, as frações e a conta de cada linha da DRE, obra a obra e mês a mês.',
        ],
      },
    ],
  },
];

module.exports = { ABAS_SUMARIO };
