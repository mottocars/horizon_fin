const pool = require('../../../config/db');
const { criarConsultaSql } = require('../tools/consultaSql');
const { ferramenta } = require('../dfc/tools/comum');

// SQL livre de leitura sobre as views mcp_* da cobrança (cada uma já filtra a empresa do conector e roda no
// papel mcp_leitor — ver tools/consultaSql.js e database/migrations/2026-11-11-mcp-cobranca-views.sql).

const VIEWS = {
  mcp_sie_income:
    'Contas a receber do Sienge (1 linha por parcela): bill_id (título), installment_id (parcela), installment_number ("3/12"), client_id, client_name, due_date, original_amount, corrected_balance_amount (saldo corrigido; 0 = quitada), origin_id (só "CO" é cobrança), payment_term_description (tipo de pagamento — compare com TRIM), document_identification_name, document_number.',
  mcp_sie_income_categorias: 'Rateio de cada parcela por centro de custo: bill_id, installment_id, cost_center_id, cost_center_name, financial_category_id/name, rate.',
  mcp_sie_income_recebimentos:
    'Baixas de cada parcela: bill_id, installment_id, payment_date, operation_type_name ("Recebimento" = dinheiro; Reparcelamento, Distrato etc. zeram sem dinheiro), net_amount, gross_amount.',
  mcp_sie_customers: 'Cadastro de clientes do Sienge: id (= client_id), name, email, cpf/cnpj e endereço.',
  mcp_sie_customers_phones: 'Telefones dos clientes: customer_id (= client_id), number, main (principal — é o usado no WhatsApp).',
  mcp_sie_customers_comunicar: 'Flag "Comunicar" da aba Clientes: client_id, comunicar (false = fora da cobrança), atualizado_em. Sem linha = comunicar.',
  mcp_cobranca_clientes_clusters:
    'Cluster ATUAL de cada cliente: client_id, client_name, cluster (novo/bom/duvidoso/mau), score, motivo_tipo (score/regra_dura/novo_cliente), regra_dura_ativa, parcelas_em_dia_seguidas, mes_referencia, calculado_em, indicadores_detalhe (JSON com cada indicador e o contexto).',
  mcp_cobranca_clusters_historico:
    'Histórico do cluster por competência: client_id, mes_referencia, cluster_anterior, cluster_novo, score, regra_dura_disparada, regra_dura_detalhe, subiu_bloqueado_por_trava, criado_em, criado_por_usuario_id.',
  mcp_motor_risco_versoes:
    'Versões do Motor de Risco (vale a de maior versao): versao, tolerancia_dias, janela_observacao_meses, gatilho_reincidencia_dias, minimo_parcelas, dia_recalculo, trava_subida_parcelas, dias_vencidos_regua_cobranca (limite da Inadimplência), corte_bom_pagador, corte_pagador_duvidoso, criado_em, criado_por_usuario_id.',
  mcp_motor_risco_indicadores: 'Indicadores de cada versão: versao_id (-> mcp_motor_risco_versoes.id), indicador, nota_0, nota_100, peso.',
  mcp_regua_cobranca_etapas:
    'Etapas da régua: id, cluster (novo/bom/duvidoso/mau/inad), nome, dias (D±N do vencimento), canal_whatsapp, canal_email, canal_ligacao, template_id, responsavel_usuario_id, ativa, rotina_habilitada, criado_em, atualizado_em.',
  mcp_comunicacao_templates: 'Templates de mensagem: id, nome, assunto, corpo (com @nome_cliente, @centro_custo, @vencimento, @valor), enviar_boleto, clusters (array).',
  mcp_regua_cobranca_tipos_pagamento: 'Tipos de pagamento que ENTRAM na cobrança: descricao (compare com TRIM(payment_term_description)), criado_em, criado_por.',
  mcp_regua_cobranca_historico_registros:
    'Registros de contato de cada parcela: bill_id, installment_id, data_registro (data da tarefa/contato), canal (whatsapp/email/ligacao; NULL = observação), tipo (manual/automatico), usuario_id (quem fez), descricao (texto enviado/observação), criado_em.',
  mcp_regua_cobranca_envios_falhos: 'Envios de WhatsApp/e-mail que falharam: bill_id, installment_id, canal, data_registro, mensagem_erro, criado_em (some quando um envio depois dá certo).',
  mcp_regua_cobranca_distribuicao_itens:
    'Distribuição gravada de cada dia (1 linha por cliente × dia): data, client_id, usuario_id (atendente), motivo (continuidade/novo/liberado/cobertura/transferido), faixa (etapa mais grave do cliente no dia), valor, titulos, gerado_em.',
  mcp_regua_cobranca_distribuicao_presencas: 'Quem participou da distribuição de cada dia (dias trabalhados): data, usuario_id.',
  mcp_regua_cobranca_distribuicao_participantes: 'Atendentes atuais da distribuição: usuario_id, entrou_em, pausado_ate, placar_herdado_de, herdado_em.',
  mcp_regua_cobranca_carteira: 'Carteira (dono de cada cliente): client_id, usuario_id, desde, ultima_aparicao (última vez na Rotina).',
  mcp_regua_cobranca_distribuicao_log: 'Log da distribuição: acao (modo, entrada, saida, pausa, retomada, substituicao, distribuicao, redistribuicao, liberacao), descricao, usuario_id (NULL = Monitor), criado_em.',
  mcp_cobranca_usuarios: 'Nomes dos usuários (id, nome) — use para trocar usuario_id/responsavel_usuario_id/criado_por por nome.',
};

const descrever = {
  name: 'cobranca_descrever_tabelas',
  description: 'Descreve as tabelas (views) liberadas para cobranca_consultar_sql: o que é cada uma e as colunas. Chame antes de escrever SQL.',
  inputSchema: {},
  handler: ferramenta(async () => {
    const { rows } = await pool.query(
      `SELECT table_name, string_agg(column_name || ' ' || data_type, ', ' ORDER BY ordinal_position) AS colunas
         FROM information_schema.columns WHERE table_name = ANY($1::text[]) GROUP BY table_name`,
      [Object.keys(VIEWS)]
    );
    const colunas = Object.fromEntries(rows.map((r) => [r.table_name, r.colunas]));
    return {
      regras: [
        'Não filtre empresa: as views já trazem só a empresa deste conector.',
        "Cobrança é só origin_id = 'CO'. Parcela = (bill_id, installment_id). Cliente = client_id.",
        'Universo da Rotina/relatório: parcela CO, de centro com etapa "Lançamento" no Histórico de Etapas, cliente com Comunicar, tipo de pagamento em mcp_regua_cobranca_tipos_pagamento (as ferramentas prontas já aplicam isso; o SQL não tem a tabela do Histórico de Etapas).',
        'D da parcela = data − due_date; Inadimplência = D > dias_vencidos_regua_cobranca da última versão do Motor de Risco.',
        "Evite EXTRACT(x FROM y); use date_part('x', y). Uma instrução só, no máximo 500 linhas.",
      ],
      tabelas: Object.entries(VIEWS).map(([nome, descricao]) => ({ nome, descricao, colunas: colunas[nome] || '(view ainda não criada no banco)' })),
    };
  }),
};

const consultar = criarConsultaSql({
  name: 'cobranca_consultar_sql',
  description:
    'Executa uma consulta SQL de LEITURA (só SELECT/WITH) sobre as views mcp_* da cobrança (contas a receber, clientes, clusters, Motor de ' +
    'Risco, régua, templates, registros de contato, envios que falharam, distribuição, carteira), para perguntas que as outras ferramentas ' +
    'não cobrem. Chame cobranca_descrever_tabelas antes. Sem filtro de empresa (já aplicado), uma instrução só, no máximo 500 linhas.',
  views: Object.keys(VIEWS),
  dicaEsquema: 'cobranca_descrever_tabelas',
});

module.exports = { descrever, consultar };
