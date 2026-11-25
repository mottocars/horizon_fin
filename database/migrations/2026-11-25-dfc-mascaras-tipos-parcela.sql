-- Operações > DFC Construtoras > aba Máscaras: tipos de parcela de cada máscara detalhada por tipo de
-- parcela (complementa 2026-11-25-dfc-mascaras-tipo-parcela.sql).
--
-- parcela_tipos — siglas dos tipos de parcela do Sienge (payment_term_id de sie_income: PM, FI, AT, CH…)
--   que compõem a máscara, escolhidos no botão "TIPO PARCELAS".
-- A mesma conta do plano de contas pode estar em mais de uma máscara: elas se diferenciam pelos tipos de
--   parcela (um tipo não pode estar em duas máscaras da mesma conta — garantido no backend,
--   dfcMascaras.service.js). Sai o índice único de uma conta por máscara.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-25-dfc-mascaras-tipos-parcela.sql

BEGIN;

ALTER TABLE dfc_mascaras ADD COLUMN IF NOT EXISTS parcela_tipos TEXT[] NOT NULL DEFAULT '{}';

DROP INDEX IF EXISTS uq_dfc_mascaras_parcela_conta;
CREATE INDEX IF NOT EXISTS idx_dfc_mascaras_parcela_conta
    ON dfc_mascaras (empresa_id, parcela_conta_sienge_id)
    WHERE parcela_conta_sienge_id IS NOT NULL;

ALTER TABLE dfc_mascaras DROP CONSTRAINT IF EXISTS ck_dfc_mascaras_tipo_detalhamento;
ALTER TABLE dfc_mascaras ADD CONSTRAINT ck_dfc_mascaras_tipo_detalhamento CHECK (
    tipo_detalhamento IN ('PLANO_CONTAS', 'TIPO_PARCELA')
    AND parcela_origens <@ ARRAY['CEF_NOVO_REGISTRO', 'CEF_MEDICAO', 'SIENGE_AGING']::TEXT[]
    AND (tipo_detalhamento = 'TIPO_PARCELA'
         OR (parcela_conta_sienge_id IS NULL AND parcela_origens = '{}' AND parcela_tipos = '{}'))
);

-- Versões da DRE já salvas: a cópia de dfc_mascaras (dre_vc_<id>) ganha a coluna, vazia.
DO $$
DECLARE s TEXT;
BEGIN
  FOR s IN SELECT nspname FROM pg_namespace WHERE nspname ~ '^dre_vc_[0-9]+$' LOOP
    IF to_regclass(format('%I.dfc_mascaras', s)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.dfc_mascaras ADD COLUMN IF NOT EXISTS parcela_tipos TEXT[] NOT NULL DEFAULT ''{}''', s);
    END IF;
  END LOOP;
END $$;

COMMIT;
