-- Operações > DFC Construtoras > aba Centros Custos: flag "Projeta DFC". Só os centros marcados
-- (e do tipo Obra) aparecem na aba Parâmetros. Campo de enriquecimento — nunca sobrescrito pela
-- sincronização com o Sienge. Começa desmarcado pra todos.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-13-centros-custo-projeta-dfc.sql

ALTER TABLE centros_custo_sienge
    ADD COLUMN IF NOT EXISTS projeta_dfc BOOLEAN NOT NULL DEFAULT FALSE;
