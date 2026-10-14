-- DFC Construtoras > Parâmetros: "Quantidade de Vendas no Mês" só existe quando "Projeta Vendas
-- Futuras" = Sim — com Não, fica NULL (validado no backend: obrigatória só com Sim).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-dfc-parametros-qtd-vendas-opcional.sql

ALTER TABLE dfc_parametros_versoes ALTER COLUMN qtd_vendas_mes DROP NOT NULL;
