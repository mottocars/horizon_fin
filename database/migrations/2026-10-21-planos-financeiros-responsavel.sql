-- Cadastros > Planos Financeiros > conta: o cadastro da conta passa a ter só Pacote e Responsável
-- (usuário com a empresa no cadastro, usuarios_empresas). As demais colunas de enriquecimento
-- (classificação DFC, submáscaras, projeção, incrementos...) saíram da tela, mas continuam na tabela.
-- ON DELETE SET NULL: apagar o usuário só deixa a conta sem responsável.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-21-planos-financeiros-responsavel.sql

ALTER TABLE planos_financeiros_sienge
    ADD COLUMN IF NOT EXISTS responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
