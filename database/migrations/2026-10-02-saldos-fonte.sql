-- Saldo Contas Bancárias: registra qual integração trouxe cada saldo automático (VanPix ou
-- API Itaú). Linhas API anteriores ficam com fonte NULL e são lidas como VanPix (era a única).
-- Só adiciona a coluna — nenhuma linha existente é alterada.
-- Aplicar na VPS: docker exec -i horizonhub-db-1 psql -U postgres -d horizon_fin < database/migrations/2026-10-02-saldos-fonte.sql
BEGIN;

ALTER TABLE saldos_contas_bancarias
    ADD COLUMN IF NOT EXISTS fonte VARCHAR(10) CHECK (fonte IN ('VANPIX', 'ITAU'));


COMMIT;
