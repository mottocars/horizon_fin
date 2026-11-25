-- Operações > DFC Construtoras > aba Máscaras: tipo de detalhamento de cada máscara de nível 2.
--
-- tipo_detalhamento — 'PLANO_CONTAS' (padrão, tudo como sempre foi: as contas do Plano Contas com essa
--   Máscara DFC compõem a linha) ou 'TIPO_PARCELA' (a linha é detalhada pelo tipo de parcela).
-- parcela_conta_sienge_id — só no TIPO_PARCELA: a conta do plano de contas (analítica) que a máscara
--   assume. Essa conta fica travada na aba Plano Contas (Global e versões dos centros) — não tem mais papel
--   próprio na DFC. Uma conta só pode estar em uma máscara.
-- parcela_origens — só no TIPO_PARCELA: as origens que compõem a máscara (uma ou mais de CEF - NOVO
--   REGISTRO, CEF - MEDIÇÃO e SIENGE - AGING).
-- Nível 1 é sempre PLANO_CONTAS (o backend limpa ao mover um item de nível 2 para o nível 1).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-25-dfc-mascaras-tipo-parcela.sql

BEGIN;

ALTER TABLE dfc_mascaras
    ADD COLUMN IF NOT EXISTS tipo_detalhamento       VARCHAR(20) NOT NULL DEFAULT 'PLANO_CONTAS',
    ADD COLUMN IF NOT EXISTS parcela_conta_sienge_id INTEGER,
    ADD COLUMN IF NOT EXISTS parcela_origens         TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE dfc_mascaras DROP CONSTRAINT IF EXISTS ck_dfc_mascaras_tipo_detalhamento;
ALTER TABLE dfc_mascaras ADD CONSTRAINT ck_dfc_mascaras_tipo_detalhamento CHECK (
    tipo_detalhamento IN ('PLANO_CONTAS', 'TIPO_PARCELA')
    AND parcela_origens <@ ARRAY['CEF_NOVO_REGISTRO', 'CEF_MEDICAO', 'SIENGE_AGING']::TEXT[]
    AND (tipo_detalhamento = 'TIPO_PARCELA' OR (parcela_conta_sienge_id IS NULL AND parcela_origens = '{}'))
);

-- Uma conta do plano de contas em no máximo uma máscara de cada empresa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dfc_mascaras_parcela_conta
    ON dfc_mascaras (empresa_id, parcela_conta_sienge_id)
    WHERE parcela_conta_sienge_id IS NOT NULL;

-- Versões da DRE já salvas: a cópia de dfc_mascaras (dre_vc_<id>) ganha as mesmas colunas, com o padrão
-- (PLANO_CONTAS) — assim qualquer consulta que leia as colunas novas dentro de uma versão não quebra.
DO $$
DECLARE s TEXT;
BEGIN
  FOR s IN SELECT nspname FROM pg_namespace WHERE nspname ~ '^dre_vc_[0-9]+$' LOOP
    IF to_regclass(format('%I.dfc_mascaras', s)) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I.dfc_mascaras
            ADD COLUMN IF NOT EXISTS tipo_detalhamento       VARCHAR(20) NOT NULL DEFAULT ''PLANO_CONTAS'',
            ADD COLUMN IF NOT EXISTS parcela_conta_sienge_id INTEGER,
            ADD COLUMN IF NOT EXISTS parcela_origens         TEXT[] NOT NULL DEFAULT ''{}''', s);
    END IF;
  END LOOP;
END $$;

COMMIT;
