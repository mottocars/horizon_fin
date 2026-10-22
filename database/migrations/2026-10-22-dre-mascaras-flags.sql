-- Operações > DRE Gerencial > Máscaras: duas marcações nas máscaras de nível 1, por enquanto só
-- informativas (nenhum cálculo usa ainda):
--   totalizadora — linha de subtotal da DRE: não tem máscaras de nível 2 dentro (nem drilldown).
--                  Garantido no backend (dreMascaras.service.js), que recusa marcar um grupo com
--                  filhos e criar/mover filho pra dentro de uma totalizadora.
--   realiza_poc  — a linha é apropriada por POC (percentual de obra concluída).
-- Nível 2 nunca tem marcação (CHECK); ao virar nível 2 arrastando, o backend limpa as duas.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-22-dre-mascaras-flags.sql

ALTER TABLE dre_mascaras ADD COLUMN IF NOT EXISTS totalizadora BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE dre_mascaras ADD COLUMN IF NOT EXISTS realiza_poc  BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE dre_mascaras DROP CONSTRAINT IF EXISTS dre_mascaras_flags_so_nivel_1;
ALTER TABLE dre_mascaras ADD CONSTRAINT dre_mascaras_flags_so_nivel_1
    CHECK (parent_id IS NULL OR (NOT totalizadora AND NOT realiza_poc));
