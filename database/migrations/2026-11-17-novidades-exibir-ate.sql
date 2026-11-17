-- Cadastros › Novidades: "Exibir até" — último dia em que a novidade é veiculada (janela ao entrar e
-- botão Novidades do topo). NULL = sem data para acabar. Depois dele a novidade continua no cadastro
-- (Encerrada), com o histórico de quem viu.
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-11-17-novidades-exibir-ate.sql

BEGIN;

ALTER TABLE novidades ADD COLUMN IF NOT EXISTS exibir_ate DATE;

ALTER TABLE novidades DROP CONSTRAINT IF EXISTS novidades_exibir_ate_check;
ALTER TABLE novidades ADD CONSTRAINT novidades_exibir_ate_check CHECK (exibir_ate IS NULL OR exibir_ate >= exibir_a_partir);

COMMIT;
