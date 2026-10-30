-- Operações > DRE Gerencial > Financeiro: os lançamentos de cada exercício são filtrados pela
-- EMISSÃO dos títulos (issue_date) — sem índice, cada consulta varria o contas a pagar e a receber
-- inteiros da empresa. Só índices (nada muda nos dados).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-30-sie-emissao-indices.sql

CREATE INDEX IF NOT EXISTS idx_sie_income_emissao ON sie_income (empresa_id, issue_date);
CREATE INDEX IF NOT EXISTS idx_sie_outcome_emissao ON sie_outcome (empresa_id, issue_date);
