-- Operações > DRE Gerencial > aba Centros Custos: flag "Realiza DRE" do centro de custo — mesmo
-- papel do "Projeta DFC" (projeta_dfc) na aba Centros Custos da DFC Construtoras. Só os centros
-- marcados podem ganhar plano de contas próprio na aba Plano de Contas da DRE e contam como
-- "seguindo" o plano Global.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-23-centros-realiza-dre.sql

ALTER TABLE centros_custo_sienge ADD COLUMN IF NOT EXISTS realiza_dre BOOLEAN NOT NULL DEFAULT FALSE;
