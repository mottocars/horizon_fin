-- Cadastros › Máscaras (pedido do usuário, 26/11/2026):
-- 1) Os tipos DRE, DFC, SUBMASCARA_DRE e SUBMASCARA_DFC deixam de existir. A DRE Gerencial usa dre_mascaras desde
--    22/10 (os itens tipo 'DRE' daqui ficaram só como histórico, sem nenhuma conta apontando para eles) e a DFC usa
--    dfc_mascaras; DFC e Submáscaras nunca tiveram itens. As colunas classificacao_dfc_id / submascara_dre_id /
--    submascara_dfc_id do plano financeiro ficam (estão vazias e a view mcp_dfc_naturezas do conector MCP as lê).
-- 2) Pacotes e Pilares ganham o Responsável (usuário com acesso à empresa), escolhido na própria máscara — usado
--    na Gestão Matricial do dashboard Econômico/Financeiro.
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-11-26-mascaras-responsavel.sql

BEGIN;

ALTER TABLE mascara_itens ADD COLUMN IF NOT EXISTS responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

DELETE FROM mascara_itens WHERE tipo IN ('DRE', 'DFC', 'SUBMASCARA_DRE', 'SUBMASCARA_DFC');

COMMIT;
