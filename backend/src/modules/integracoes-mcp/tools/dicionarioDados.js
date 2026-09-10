// Dicionário de dados HARDCODED (não introspecta information_schema de
// propósito — ver consultaSql.js): só descreve as views `mcp_*` liberadas
// pra ferramenta de SQL livre, cada uma já filtrada por empresa no próprio
// Postgres (ver database/schema.sql). Ficar restrito a esta lista fixa é
// parte da defesa em profundidade contra vazar nome de tabela/coluna fora
// da allowlist, e permite anotar semântica de negócio que uma introspecção
// automática não teria (ex.: "sempre considere origin_id = 'CO'").
const ESQUEMA = {
  mcp_sie_income: {
    descricao:
      'Contas a receber (parcelas de venda de imóveis) vindas do Sienge. Cada linha é 1 parcela de 1 título ' +
      '(bill_id + installment_id). IMPORTANTE: sempre filtre origin_id = \'CO\' — é o único origin_id que ' +
      'representa conta a receber de verdade para fins de cobrança; os demais são outros tipos de lançamento.',
    colunas: {
      bill_id: 'ID do título (contrato/carnê) no Sienge.',
      installment_id: 'Número da parcela dentro do título.',
      client_id: 'ID do cliente (junte com mcp_sie_customers.id).',
      client_name: 'Nome do cliente, já pronto (não precisa juntar com sie_customers só para o nome).',
      due_date: 'Data de vencimento da parcela.',
      corrected_balance_amount:
        'Saldo em aberto da parcela, já corrigido monetariamente. 0 = parcela quitada. Compare due_date com ' +
        'CURRENT_DATE para saber se está vencida (due_date < CURRENT_DATE e corrected_balance_amount <> 0 = ' +
        'vencida e em aberto).',
      original_amount: 'Valor original da parcela, sem correção.',
      origin_id: "Tipo de lançamento — filtre sempre por = 'CO' (conta a receber real).",
      installment_number: 'Número sequencial da parcela (1, 2, 3...) dentro do título, para exibição.',
      document_number: 'Número do documento/contrato, para exibição.',
      defaulter_situation: 'Situação de inadimplência conforme classificação do próprio Sienge (texto livre).',
    },
  },
  mcp_sie_income_categorias: {
    descricao: 'Rateio de cada parcela de mcp_sie_income por centro de custo (empreendimento/obra) e categoria financeira.',
    colunas: {
      bill_id: 'Junte com mcp_sie_income.bill_id.',
      installment_id: 'Junte com mcp_sie_income.installment_id.',
      cost_center_id: 'ID do centro de custo (empreendimento/obra).',
      cost_center_name: 'Nome do centro de custo, já pronto.',
      financial_category_name: 'Nome da categoria financeira do lançamento.',
    },
  },
  mcp_sie_income_recebimentos: {
    descricao: 'Pagamentos/recebimentos reais já baixados contra parcelas de mcp_sie_income.',
    colunas: {
      bill_id: 'Junte com mcp_sie_income.bill_id.',
      installment_id: 'Junte com mcp_sie_income.installment_id.',
      payment_date: 'Data em que o pagamento foi efetivamente recebido.',
      net_amount: 'Valor líquido recebido.',
    },
  },
  mcp_sie_customers: {
    descricao: 'Cadastro de clientes do Sienge.',
    colunas: {
      id: 'ID do cliente — corresponde a mcp_sie_income.client_id.',
      name: 'Nome/razão social do cliente.',
      email: 'E-mail do cliente, quando cadastrado.',
    },
  },
  mcp_sie_customers_phones: {
    descricao: 'Telefones cadastrados por cliente (um cliente pode ter mais de um).',
    colunas: {
      customer_id: 'Junte com mcp_sie_customers.id.',
      number: 'Número de telefone.',
      main: 'true = telefone principal deste cliente.',
    },
  },
  mcp_cobranca_clientes_clusters: {
    descricao:
      'Classificação de risco atual de cada cliente (1 linha por cliente). Recalculada periodicamente pelo Motor ' +
      'de Risco — para uma explicação detalhada de por que um cliente está em determinado cluster, prefira a ' +
      'ferramenta explicar_cluster_cliente em vez de consultar esta view diretamente.',
    colunas: {
      client_id: 'Junte com mcp_sie_income.client_id / mcp_sie_customers.id.',
      client_name: 'Nome do cliente.',
      cluster: "Classificação atual: 'novo', 'bom', 'duvidoso' ou 'mau'.",
      score: 'Pontuação de 0 a 100 usada para classificar (nulo quando o motivo não é score, ver motivo_tipo).',
      motivo_tipo: "Por que está neste cluster: 'score' (pontuação normal), 'novo_cliente' (poucas parcelas para " +
        "avaliar ainda) ou 'regra_dura' (tem parcela vencida há muitos dias, força cluster 'mau' independente do score).",
    },
  },
  mcp_regua_cobranca_historico_registros: {
    descricao:
      'Histórico de toda interação de cobrança feita com o cliente (WhatsApp, e-mail, ligação ou anotação ' +
      'manual). NÃO tem client_id direto — para saber de qual cliente é um registro, junte com mcp_sie_income ' +
      'por (bill_id, installment_id).',
    colunas: {
      bill_id: 'Junte com mcp_sie_income.bill_id.',
      installment_id: 'Junte com mcp_sie_income.installment_id.',
      tipo: "'manual' (registrado por alguém) ou 'automatico' (enviado pela régua de cobrança automática).",
      canal: "'whatsapp', 'email' ou 'ligacao'.",
      descricao: 'Texto da mensagem enviada ou anotação feita.',
      data_registro: 'Data em que o contato aconteceu — use MAX(data_registro) por cliente para achar o último contato.',
    },
  },
};

module.exports = {
  name: 'descrever_esquema_dados',
  description:
    'Descreve as tabelas (views) e colunas disponíveis para consulta livre via a ferramenta consultar_dados_sql ' +
    '(contas a receber, clientes, rateio por centro de custo, recebimentos, histórico de cobrança e clusters de ' +
    'risco), incluindo observações de negócio importantes (ex.: qual filtro sempre aplicar). Chame esta ' +
    'ferramenta ANTES de montar uma consulta SQL para saber os nomes exatos de tabelas/colunas e como elas se ' +
    'relacionam.',
  inputSchema: {},
  handler() {
    return async () => ({ content: [{ type: 'text', text: JSON.stringify(ESQUEMA, null, 2) }] });
  },
};
