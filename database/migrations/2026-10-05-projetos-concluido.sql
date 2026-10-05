-- Plano de Voo: bucket "Concluído" (entre Progresso e Finalizado). O responsável conclui; só o
-- criador finaliza. Só amplia o CHECK de status e acrescenta concluido_em — nenhuma linha muda.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-05-projetos-concluido.sql
BEGIN;

ALTER TABLE projetos_cards DROP CONSTRAINT IF EXISTS projetos_cards_status_check;
ALTER TABLE projetos_cards ADD CONSTRAINT projetos_cards_status_check
    CHECK (status IN ('AGUARDANDO', 'PROGRESSO', 'CONCLUIDO', 'FINALIZADO'));
ALTER TABLE projetos_cards ADD COLUMN IF NOT EXISTS concluido_em TIMESTAMP;

COMMIT;
