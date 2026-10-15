-- MCP: conector "DFC CONSTRUTORAS (ALTERA ORÇAMENTO)" (pedido do usuário) — o mesmo conector do DFC
-- (login Horizon com validade e todas as ferramentas de leitura) mais ferramentas que inserem/atualizam
-- valores do Orçamento, só nas contas com Origem Projeção "HORIZON - INFORMADO", e salvam uma versão
-- só com essas mudanças. Ver backend/src/modules/integracoes-mcp/dfc/tools/informado.js.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-15-mcp-dfc-altera-orcamento.sql

ALTER TABLE integracoes_mcp DROP CONSTRAINT IF EXISTS integracoes_mcp_escopo_check;
ALTER TABLE integracoes_mcp ADD CONSTRAINT integracoes_mcp_escopo_check CHECK (escopo IN ('COBRANCA', 'DFC_CONSTRUTORAS', 'DFC_ORCAMENTO'));

-- Valor informado gravado pelo Claude (conector MCP) e não na aba Orçamentos — aparece assim no log
-- da versão ("Informado pelo Claude (conector MCP)").
ALTER TABLE dfc_orcamento_informado ADD COLUMN IF NOT EXISTS via_mcp BOOLEAN NOT NULL DEFAULT false;
