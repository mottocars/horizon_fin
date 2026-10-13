-- Operações > DFC Construtoras > aba Centros Custos: cada centro de custo é classificado como
-- OBRA ou ADMINISTRATIVO (NULL = ainda não classificado). Campo de enriquecimento — nunca
-- sobrescrito pela sincronização com o Sienge. (Não confundir com `tipo`, que é o código de tipo
-- de empreendimento que vem do próprio Sienge.)
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-13-centros-custo-natureza.sql

ALTER TABLE centros_custo_sienge
    ADD COLUMN IF NOT EXISTS natureza VARCHAR(15)
    CHECK (natureza IN ('OBRA', 'ADMINISTRATIVO'));
