-- Integrações > MCP: um conector Horizon só, com módulos marcáveis (pedido do usuário), no lugar dos
-- tipos DFC_CONSTRUTORAS / DFC_ORCAMENTO:
--   DFC            — leitura do DFC Construtoras
--   DFC_ORCAMENTO  — inclui DFC + alteração do Orçamento (HORIZON - INFORMADO)
--   SALDOS_CONTAS  — leitura do Saldo Contas Bancárias
-- escopo passa a ser COBRANCA (token na URL, de sempre) ou HORIZON (login do Horizon via OAuth). A URL
-- (/api/mcp/dfc/<token>) e as sessões de login dos conectores existentes continuam valendo.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-28-mcp-modulos.sql

ALTER TABLE integracoes_mcp ADD COLUMN IF NOT EXISTS modulos TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE integracoes_mcp DROP CONSTRAINT IF EXISTS integracoes_mcp_escopo_check;

UPDATE integracoes_mcp SET escopo = 'HORIZON', modulos = ARRAY['DFC'] WHERE escopo = 'DFC_CONSTRUTORAS';
UPDATE integracoes_mcp SET escopo = 'HORIZON', modulos = ARRAY['DFC', 'DFC_ORCAMENTO'] WHERE escopo = 'DFC_ORCAMENTO';

ALTER TABLE integracoes_mcp ADD CONSTRAINT integracoes_mcp_escopo_check CHECK (escopo IN ('COBRANCA', 'HORIZON'));
