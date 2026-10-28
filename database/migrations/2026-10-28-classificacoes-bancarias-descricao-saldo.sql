-- Operações > Saldo Contas Bancárias > aba Classificação: cada classificação ganha
--   descricao    — o motivo da classificação, por que ela é necessária e o que ela classifica;
--   libera_saldo — se o saldo das contas nessa classificação é liberado (TRUE) ou bloqueado (FALSE).
-- As já cadastradas ficam com libera_saldo NULL ("não informado") até alguém editar — o
-- formulário obriga a escolher ao salvar. Não preenche pelo nome de propósito (GARANTIDA,
-- DEDICADA, APLICACAO... dependem de como a empresa usa cada uma).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-28-classificacoes-bancarias-descricao-saldo.sql

ALTER TABLE classificacoes_bancarias
    ADD COLUMN IF NOT EXISTS descricao    TEXT,
    ADD COLUMN IF NOT EXISTS libera_saldo BOOLEAN;
