-- Segurança das consultas SQL dos conectores MCP (ferramentas consultar_sql / dfc_consultar_sql): o SQL
-- escrito pelo Claude passa a rodar no papel mcp_leitor (SET LOCAL ROLE na transação — ver
-- backend/src/modules/integracoes-mcp/tools/consultaSql.js), que só pode LER as views mcp_*. A checagem de
-- nomes do backend continua, mas quem garante o isolamento é o banco: antes, a consulta rodava como o
-- usuário da aplicação (superusuário) e um "FROM mcp_x, outra_tabela" escapava da checagem.
-- As views mcp_* rodam com os privilégios do dono (não são security_invoker), então continuam lendo as
-- tabelas delas e filtrando pela empresa do conector (app.empresa_id).
-- View mcp_* nova: rode este arquivo de novo (ele é idempotente) para dar o GRANT nela.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-15-mcp-leitor-sql.sql

DO $$
DECLARE v record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_leitor') THEN
    CREATE ROLE mcp_leitor NOLOGIN;
  END IF;
  -- O usuário da aplicação precisa poder assumir o papel (superusuário já pode; os demais, via membership).
  EXECUTE format('GRANT mcp_leitor TO %I', current_user);
  GRANT USAGE ON SCHEMA public TO mcp_leitor;
  FOR v IN SELECT viewname FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'mcp\_%' LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO mcp_leitor', v.viewname);
  END LOOP;
END $$;
