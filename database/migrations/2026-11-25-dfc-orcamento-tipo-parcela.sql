-- Operações > DFC Construtoras: o Orçamento (versões) passa a guardar o tipo de parcela.
--
-- Máscara de nível 2 detalhada por tipo de parcela (aba Máscaras — 2026-11-25-dfc-mascaras-tipo-parcela.sql):
-- a conta que ela assume recebe as origens dela (CEF - NOVO REGISTRO / CEF - MEDIÇÃO no único tipo da
-- máscara; SIENGE - AGING separado pelo tipo de cada parcela). O valor de cada tipo é guardado à parte,
-- pra aba DFC mostrar os tipos abaixo da máscara. tipo_parcela = '' é o de sempre (conta do plano de contas).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-25-dfc-orcamento-tipo-parcela.sql

BEGIN;

ALTER TABLE dfc_orcamento_valores ADD COLUMN IF NOT EXISTS tipo_parcela VARCHAR(20) NOT NULL DEFAULT '';
ALTER TABLE dfc_orcamento_valores DROP CONSTRAINT IF EXISTS dfc_orcamento_valores_pkey;
ALTER TABLE dfc_orcamento_valores ADD PRIMARY KEY (empresa_id, centro_id, sienge_id, tipo_parcela, mes);

ALTER TABLE dfc_orcamento_log ADD COLUMN IF NOT EXISTS tipo_parcela VARCHAR(20) NOT NULL DEFAULT '';
DROP INDEX IF EXISTS idx_dfc_orcamento_log_valor;
CREATE INDEX IF NOT EXISTS idx_dfc_orcamento_log_valor ON dfc_orcamento_log (empresa_id, centro_id, sienge_id, tipo_parcela, mes);

COMMIT;
