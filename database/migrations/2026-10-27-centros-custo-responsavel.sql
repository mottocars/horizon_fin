-- Cadastros > Centros de Custo: o cadastro do centro ganha o Responsável (usuário ativo com a
-- empresa no cadastro, usuarios_empresas — a mesma regra do Responsável do Plano Financeiro).
-- ON DELETE SET NULL: apagar o usuário só deixa o centro sem responsável.
-- A view mcp_dfc_centros_custo (SELECT * congelado na criação) não ganha a coluna.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-27-centros-custo-responsavel.sql

ALTER TABLE centros_custo_sienge
    ADD COLUMN IF NOT EXISTS responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
