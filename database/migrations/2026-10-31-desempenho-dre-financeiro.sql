-- Desempenho da DRE Gerencial (abas DRE, POC e Financeiro): a consulta que monta as linhas do
-- Financeiro (dre-financeiro/financeiro.service.js — CTE_LINHAS) era ~95% do tempo do cálculo.
--
-- 1) random_page_cost = 1.1 (o padrão do Postgres, 4, é pra disco mecânico): com 4 o planejador cruzava
--    as linhas do Financeiro com o mapa da DRE uma a uma (~30 milhões de comparações); com 1.1 usa
--    junção por hash — na produção, DRE 2,1 s → 0,5 s, com o mesmo resultado. Só pro usuário do Horizon
--    Fin neste banco (horizonfin_app na VPS; onde ele não existe, o usuário que roda a migração — no
--    ambiente local o app conecta como postgres). Não mexe no Horizon Hub, que divide o Postgres.
--    Vale nas conexões novas (reiniciar o backend). Desfazer:
--      ALTER ROLE horizonfin_app IN DATABASE horizon_fin RESET random_page_cost;
-- 2) Índices (não mudam resultado de consulta nenhuma, só o caminho):
--    - plano de contas pelo código em texto: a junção compara sienge_id::text, o que não usa a chave
--      (sienge_id, empresa_id);
--    - rateio dos títulos "cobrindo" as colunas que a DRE lê (centro, natureza, percentual): o Postgres
--      lê do índice, sem ir à tabela, nas ~33 mil buscas por cálculo.
--    CONCURRENTLY: não trava as gravações da sincronização do Sienge enquanto o índice é montado. Por
--    isso NÃO roda dentro de transação (psql sem -1). Se um CREATE falhar no meio, fica um índice
--    INVALID: apagar com DROP INDEX CONCURRENTLY <nome> e rodar de novo.
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-10-31-desempenho-dre-financeiro.sql

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_planos_fin_sienge_texto
    ON planos_financeiros_sienge (empresa_id, (sienge_id::text));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sie_income_categorias_rateio
    ON sie_income_categorias (bill_id, installment_id, empresa_id)
    INCLUDE (cost_center_id, cost_center_name, financial_category_id, financial_category_name, financial_category_rate);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sie_outcome_categorias_rateio
    ON sie_outcome_categorias (bill_id, installment_id, empresa_id)
    INCLUDE (cost_center_id, cost_center_name, financial_category_id, financial_category_name, financial_category_rate);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'horizonfin_app') THEN
    EXECUTE format('ALTER ROLE horizonfin_app IN DATABASE %I SET random_page_cost = 1.1', current_database());
  ELSE
    EXECUTE format('ALTER ROLE %I IN DATABASE %I SET random_page_cost = 1.1', current_user, current_database());
  END IF;
END $$;
