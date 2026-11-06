-- Operações > DRE Construtoras > Máscaras, origem Imposto Fixo > "Informar histórico" (pedido do
-- usuário): escolher QUAIS linhas de nível 2 acima do imposto formam a base dele. Antes o imposto
-- (RET) deduzia a alíquota sobre tudo o que estava acima dele na DRE.
--   imposto_base NULL      = todas as linhas de nível 2 acima (a regra de antes — inclui as que forem
--                            criadas depois acima dele);
--   imposto_base [ids]     = só essas linhas (as que estiverem acima do imposto na ordem da DRE; uma
--                            que for movida pra baixo dele deixa de contar).
-- Só faz sentido na origem IMPOSTO_FIXO (o backend só grava nela).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-06-dre-mascaras-imposto-base.sql

BEGIN;

ALTER TABLE dre_mascaras ADD COLUMN IF NOT EXISTS imposto_base INTEGER[];
ALTER TABLE dre_mascaras DROP CONSTRAINT IF EXISTS dre_mascaras_imposto_base_so_imposto;
ALTER TABLE dre_mascaras ADD CONSTRAINT dre_mascaras_imposto_base_so_imposto
    CHECK (imposto_base IS NULL OR (origem = 'IMPOSTO_FIXO' AND cardinality(imposto_base) > 0));

COMMIT;
