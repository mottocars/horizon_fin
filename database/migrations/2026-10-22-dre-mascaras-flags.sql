-- Operações > DRE Gerencial > Máscaras: marcações, por enquanto só informativas (nenhum
-- cálculo usa ainda):
--   totalizadora — só nível 1. Linha de subtotal da DRE: não tem máscaras de nível 2 dentro (nem
--                  drilldown). Garantido no backend (dreMascaras.service.js), que recusa marcar um
--                  grupo com filhos e criar/mover filho pra dentro de uma totalizadora.
--   realiza_poc  — só nível 2. A linha é apropriada por POC (percentual de obra concluída).
--   tipo_poc     — só com realiza_poc: 'RECEITA' (POC Receita) ou 'DESPESA' (POC Despesa). Pode
--                  ficar vazio; desmarcar realiza_poc limpa (o backend faz junto, no mesmo UPDATE).
--   icone        — os dois níveis: sinal da linha na DRE. 'MAIS' (+), 'MENOS' (-), 'MAIS_MENOS' (+/-)
--                  escolhidos na tela, ou 'IGUAL' (=), que é automático: só e sempre com
--                  totalizadora (o backend grava ao marcar e limpa ao desmarcar, no mesmo UPDATE).
-- Ao trocar de nível arrastando, o backend limpa a marcação que não vale no nível novo.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-22-dre-mascaras-flags.sql

ALTER TABLE dre_mascaras ADD COLUMN IF NOT EXISTS totalizadora BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE dre_mascaras ADD COLUMN IF NOT EXISTS realiza_poc  BOOLEAN NOT NULL DEFAULT FALSE;

-- Primeira versão desta migração (só no ambiente local) deixava realiza_poc no nível 1.
ALTER TABLE dre_mascaras DROP CONSTRAINT IF EXISTS dre_mascaras_flags_so_nivel_1;
UPDATE dre_mascaras SET realiza_poc = FALSE WHERE parent_id IS NULL AND realiza_poc;

ALTER TABLE dre_mascaras DROP CONSTRAINT IF EXISTS dre_mascaras_totalizadora_so_nivel_1;
ALTER TABLE dre_mascaras ADD CONSTRAINT dre_mascaras_totalizadora_so_nivel_1
    CHECK (parent_id IS NULL OR NOT totalizadora);

ALTER TABLE dre_mascaras DROP CONSTRAINT IF EXISTS dre_mascaras_realiza_poc_so_nivel_2;
ALTER TABLE dre_mascaras ADD CONSTRAINT dre_mascaras_realiza_poc_so_nivel_2
    CHECK (parent_id IS NOT NULL OR NOT realiza_poc);

ALTER TABLE dre_mascaras ADD COLUMN IF NOT EXISTS tipo_poc VARCHAR(10);

ALTER TABLE dre_mascaras DROP CONSTRAINT IF EXISTS dre_mascaras_tipo_poc_valido;
ALTER TABLE dre_mascaras ADD CONSTRAINT dre_mascaras_tipo_poc_valido
    CHECK (tipo_poc IS NULL OR (realiza_poc AND tipo_poc IN ('RECEITA', 'DESPESA')));

ALTER TABLE dre_mascaras ADD COLUMN IF NOT EXISTS icone VARCHAR(10);
UPDATE dre_mascaras SET icone = 'IGUAL' WHERE totalizadora AND icone IS DISTINCT FROM 'IGUAL';
UPDATE dre_mascaras SET icone = NULL WHERE NOT totalizadora AND icone = 'IGUAL';

ALTER TABLE dre_mascaras DROP CONSTRAINT IF EXISTS dre_mascaras_icone_valido;
ALTER TABLE dre_mascaras ADD CONSTRAINT dre_mascaras_icone_valido
    CHECK ((icone IS NULL OR icone IN ('IGUAL', 'MAIS', 'MENOS', 'MAIS_MENOS'))
           AND (icone IS NOT DISTINCT FROM 'IGUAL') = totalizadora);
