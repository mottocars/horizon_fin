const pool = require('../../../../config/db');
const { criarConsultaSql } = require('../../tools/consultaSql');
const { ferramenta } = require('./comum');

// SQL livre de leitura sobre as views mcp_dfc_* (cada uma já filtra a empresa do conector — ver
// database/migrations/2026-10-14-mcp-dfc-oauth.sql) e o dicionário delas. As colunas vêm do
// information_schema, mas só das views desta lista (nunca de outras tabelas).

const VIEWS = {
  mcp_dfc_centros_custo: 'Centros de custo do Sienge. sienge_id = id do centro; name; natureza = tipo (OBRA etc.); projeta_dfc; codigo_contrato_caixa.',
  mcp_dfc_naturezas: 'Plano financeiro do Sienge (naturezas). sienge_id = id/código; name; tp_conta (T = totalizadora); mascara_nivel_1..7 = formato do código.',
  mcp_dfc_mascaras: 'Máscaras DFC. parent_id NULL = nível 1; com parent_id = nível 2 (filho). descricao, ordem.',
  mcp_dfc_plano_contas: 'Plano Global do DFC por natureza (sienge_id): mascara_id (nível 2), origem_projecao, projeta_dfc.',
  mcp_dfc_plano_contas_centro: 'Versão própria do plano para um centro (centro_id, sienge_id, mascara_id, origem_projecao, projeta_dfc). Centro sem linhas aqui usa o Global.',
  mcp_dfc_contas_bancarias: 'Contas bancárias do Sienge (company_id, numero_conta, nome, company_name, banco_nome, tipo_descricao, projeta_dfc). Só projeta_dfc = true somam no DFC.',
  mcp_dfc_extrato: 'Extrato bancário do Sienge (um lançamento por linha): date, value (sempre positivo), type (Income/Expense), bill_id (título), installment_number, document_id, document_number, description (favorecido), statement_origin (CP/CR/BC), budget_categories (JSON do rateio). id = id do lançamento no Sienge; registro_id muda a cada sincronização.',
  mcp_dfc_extrato_rateio: 'Extrato já rateado (base do REALIZADO): registro_id (-> mcp_dfc_extrato), mes (1º dia), centro_id, natureza_id, percentual, valor (com sinal: saída negativa). Junte com mcp_dfc_contas_bancarias e use só projeta_dfc.',
  mcp_dfc_orcamento_valores: 'Valores da ÚLTIMA versão salva do Orçamento (base do PROJETADO): centro_id, sienge_id (natureza), mes (1º dia), valor (com sinal), origem.',
  mcp_dfc_orcamento_versoes: 'Versões salvas do Orçamento: numero, criado_em, usuario_id, valores, inclusoes, alteracoes, exclusoes.',
  mcp_dfc_orcamento_log: 'Log de alterações do Orçamento por versão: centro_id, sienge_id, mes, versao_id (-> mcp_dfc_orcamento_versoes.id), tipo (INCLUSAO/ALTERACAO/EXCLUSAO), valor_anterior, valor_novo, origem, fonte, fonte_descricao, responsavel_id, responsavel_em.',
  mcp_dfc_orcamento_informado: 'Valores digitados à mão (HORIZON - INFORMADO): centro_id, sienge_id, mes, valor (NULL = limpo), usuario_id, atualizado_em.',
  mcp_dfc_projecao_cef: 'Projeção CEF gravada por obra (sienge_id = centro) e mês: pct_obra_executada, delta_pct_obra_mes, qtd_registro, vgf_medicao, novo_registro, medicao, credito_pj, juros, amortizacao, saldo_devedor_pj etc. (positivos; juros/amortização saem negativos no Orçamento).',
  mcp_dfc_parametros: 'Versões dos Parâmetros da Projeção CEF por obra (sienge_id, versao): cto, valor_financiamento_pj (teto), pct_amortizacao_pj, taxa_juros_mes, data_demanda_minima, data_inicio_ciclo, data_fim_ciclo, tempo_assinatura_registro_meses.',
  mcp_dfc_avanco_manual: 'Avanço de obra digitado (sienge_id da obra, mes, percentual).',
  mcp_dfc_unidades_caixa: 'Unidades do Geral da Caixa (Repasses CEF) por contrato_empreendimento: numero_contrato_unidade, nome_mutuario, data_assinatura_contrato, data_inclusao_dados_registro_cri (registro), valor_financiamento, valor_financiamento_terreno, valor_desconto_subsidio_complementar, valor_fgts.',
  mcp_dfc_contas_pagar: 'Contas a pagar do Sienge (parcelas): bill_id, installment_id, creditor_name, document_identification_id/name, document_number, issue_date, due_date, original_amount, discount_amount, tax_amount, balance_amount.',
  mcp_dfc_contas_pagar_categorias: 'Rateio das parcelas a pagar: bill_id, installment_id, cost_center_id, cost_center_name, financial_category_id (natureza, texto), financial_category_name, financial_category_rate (%).',
  mcp_dfc_contas_receber: 'Contas a receber do Sienge (parcelas): bill_id, installment_id, client_name, document_number, issue_date, due_date, original_amount, discount_amount, tax_amount, balance_amount.',
  mcp_dfc_contas_receber_categorias: 'Rateio das parcelas a receber: bill_id, installment_id, cost_center_id, financial_category_id, financial_category_rate (%).',
  mcp_dfc_desembolso_fichas: 'Ficha de desembolso por natureza (sienge_id): prazo_medio (dias), prazo_mediano, titulos, parcelas, valor, ficha (JSON com curva e distribuições).',
  mcp_dfc_orcamento_empresarial: 'Orçamento Empresarial do Sienge achatado: orcamento_id, version_number (use a maior por orcamento_id), cost_center_id, natureza_id (texto), natureza, tipo_linha (T = totalizadora, ignore), mes, total_price.',
};

const descrever = {
  name: 'dfc_descrever_tabelas',
  description: 'Descreve as tabelas (views) liberadas para dfc_consultar_sql: o que é cada uma e as colunas. Chame antes de escrever SQL.',
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
        'Meses são datas no 1º dia (ex.: mes = DATE \'2026-09-01\').',
        'Para o realizado do DFC use mcp_dfc_extrato_rateio + mcp_dfc_contas_bancarias (projeta_dfc); para o projetado, mcp_dfc_orcamento_valores.',
        'Evite EXTRACT(x FROM y); use date_part(\'x\', y). Máximo 500 linhas.',
      ],
      tabelas: Object.entries(VIEWS).map(([nome, descricao]) => ({ nome, descricao, colunas: colunas[nome] || '' })),
    };
  }),
};

const consultar = criarConsultaSql({
  name: 'dfc_consultar_sql',
  description:
    'Executa uma consulta SQL de LEITURA (só SELECT/WITH) sobre as views mcp_dfc_* do DFC Construtoras, para perguntas que as ' +
    'outras ferramentas não cobrem. Chame dfc_descrever_tabelas antes. Sem filtro de empresa (já aplicado), uma instrução só, ' +
    'no máximo 500 linhas.',
  views: Object.keys(VIEWS),
  dicaEsquema: 'dfc_descrever_tabelas',
});

module.exports = { descrever, consultar };
