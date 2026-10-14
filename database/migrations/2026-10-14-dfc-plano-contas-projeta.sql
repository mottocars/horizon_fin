-- DFC Construtoras > Plano Contas: flag "Projeta DFC" por conta, em cada plano (Global e plano
-- próprio do centro). Desmarcada = a conta não aparece no Orçamento dos centros que usam o plano.
-- Começa marcada (TRUE) — conta sem linha também conta como marcada.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-dfc-plano-contas-projeta.sql

ALTER TABLE dfc_plano_contas ADD COLUMN IF NOT EXISTS projeta_dfc BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE dfc_plano_contas_centro ADD COLUMN IF NOT EXISTS projeta_dfc BOOLEAN NOT NULL DEFAULT TRUE;
