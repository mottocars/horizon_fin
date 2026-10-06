-- Cadastros > Empresas: logomarca da empresa (data URI PNG, redimensionada no navegador),
-- mostrada no cadastro e no lugar do avião nos Planos de Voo. Só uma coluna opcional nova.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-06-empresas-logo.sql
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS logo TEXT;
