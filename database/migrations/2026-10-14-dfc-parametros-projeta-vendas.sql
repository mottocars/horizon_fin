-- DFC Construtoras > Parâmetros: novo parâmetro "Projeta Vendas Futuras" (Sim / Não). Fica NULL
-- nas versões já publicadas antes dele; obrigatório (validado no backend) nas próximas.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-dfc-parametros-projeta-vendas.sql

ALTER TABLE dfc_parametros_versoes ADD COLUMN IF NOT EXISTS projeta_vendas_futuras BOOLEAN;
