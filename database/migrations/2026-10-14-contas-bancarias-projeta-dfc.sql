-- DFC Construtoras > Contas Correntes: flag "Projeta DFC" nas contas bancárias do Sienge
-- (endpoint v1/checking-accounts, mesma tabela da tela Saldo de Contas Bancárias). Começa
-- desmarcada, como a dos centros de custo.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-contas-bancarias-projeta-dfc.sql

ALTER TABLE contas_bancarias_sienge ADD COLUMN IF NOT EXISTS projeta_dfc BOOLEAN NOT NULL DEFAULT FALSE;
