-- Módulo GESTÃO DE COBRANÇAS do conector Horizon (MCP): views mcp_* novas para a ferramenta
-- cobranca_consultar_sql (backend/src/modules/integracoes-mcp/cobranca/sql.js). Mesmo padrão das views
-- mcp_* de sempre: cada uma filtra a empresa do conector por current_setting('app.empresa_id') e o SQL do
-- Claude roda no papel mcp_leitor, que só lê views mcp_* (GRANT no fim, igual a
-- 2026-10-15-mcp-leitor-sql.sql). As 7 views antigas da cobrança (mcp_sie_income, ..._recebimentos,
-- mcp_sie_customers, ..._phones, mcp_cobranca_clientes_clusters, mcp_regua_cobranca_historico_registros,
-- mcp_sie_income_categorias) continuam como estão.
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-11-11-mcp-cobranca-views.sql

BEGIN;

CREATE OR REPLACE VIEW mcp_cobranca_clusters_historico AS
    SELECT * FROM cobranca_clientes_clusters_historico
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE OR REPLACE VIEW mcp_motor_risco_versoes AS
    SELECT * FROM motor_risco_versoes
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE OR REPLACE VIEW mcp_motor_risco_indicadores AS
    SELECT i.* FROM motor_risco_indicadores i
    JOIN motor_risco_versoes v ON v.id = i.versao_id
    WHERE v.empresa_id = current_setting('app.empresa_id', true)::int;

CREATE OR REPLACE VIEW mcp_regua_cobranca_etapas AS
    SELECT * FROM regua_cobranca_etapas
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE OR REPLACE VIEW mcp_comunicacao_templates AS
    SELECT * FROM comunicacao_templates
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE OR REPLACE VIEW mcp_regua_cobranca_tipos_pagamento AS
    SELECT * FROM regua_cobranca_tipos_pagamento
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE OR REPLACE VIEW mcp_regua_cobranca_envios_falhos AS
    SELECT * FROM regua_cobranca_envios_falhos
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE OR REPLACE VIEW mcp_regua_cobranca_distribuicao_itens AS
    SELECT * FROM regua_cobranca_distribuicao_itens
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE OR REPLACE VIEW mcp_regua_cobranca_distribuicao_presencas AS
    SELECT * FROM regua_cobranca_distribuicao_presencas
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE OR REPLACE VIEW mcp_regua_cobranca_distribuicao_participantes AS
    SELECT * FROM regua_cobranca_distribuicao_participantes
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE OR REPLACE VIEW mcp_regua_cobranca_distribuicao_log AS
    SELECT * FROM regua_cobranca_distribuicao_log
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE OR REPLACE VIEW mcp_regua_cobranca_carteira AS
    SELECT * FROM regua_cobranca_carteira
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE OR REPLACE VIEW mcp_sie_customers_comunicar AS
    SELECT * FROM sie_customers_comunicar
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

-- Só id e nome (nada de login, e-mail ou senha) dos usuários desta empresa e de quem aparece na cobrança
-- dela (registros, distribuição, responsável de etapa) — para trocar usuario_id por nome.
CREATE OR REPLACE VIEW mcp_cobranca_usuarios AS
    SELECT u.id, u.nome FROM usuarios u
    WHERE u.id IN (
        SELECT usuario_id FROM usuarios_empresas WHERE empresa_id = current_setting('app.empresa_id', true)::int
        UNION SELECT usuario_id FROM regua_cobranca_historico_registros WHERE empresa_id = current_setting('app.empresa_id', true)::int
        UNION SELECT usuario_id FROM regua_cobranca_distribuicao_itens WHERE empresa_id = current_setting('app.empresa_id', true)::int
        UNION SELECT responsavel_usuario_id FROM regua_cobranca_etapas WHERE empresa_id = current_setting('app.empresa_id', true)::int
    );

DO $$
DECLARE v record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_leitor') THEN
    FOR v IN SELECT viewname FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'mcp\_%' LOOP
      EXECUTE format('GRANT SELECT ON public.%I TO mcp_leitor', v.viewname);
    END LOOP;
  END IF;
END $$;

COMMIT;
