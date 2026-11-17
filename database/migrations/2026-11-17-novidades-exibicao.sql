-- Cadastros › Novidades: data de exibição e "novos usuários também veem".
--   exibir_a_partir = a novidade só aparece (janela ao entrar e botão do topo) a partir deste dia
--                     (fuso de Brasília) — é também a data "Lançada em";
--   novos_usuarios  = usuários cadastrados DEPOIS de exibir_a_partir também veem (false = só quem já
--                     existia nesse dia).
-- As novidades já cadastradas ficam com a data em que foram criadas e valendo para novos usuários.
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-11-17-novidades-exibicao.sql

BEGIN;

ALTER TABLE novidades ADD COLUMN IF NOT EXISTS exibir_a_partir DATE;
ALTER TABLE novidades ADD COLUMN IF NOT EXISTS novos_usuarios BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE novidades SET exibir_a_partir = (criado_em AT TIME ZONE 'America/Sao_Paulo')::date WHERE exibir_a_partir IS NULL;

ALTER TABLE novidades ALTER COLUMN exibir_a_partir SET DEFAULT ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date);
ALTER TABLE novidades ALTER COLUMN exibir_a_partir SET NOT NULL;

COMMIT;
