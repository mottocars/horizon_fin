-- Operações > DRE Construtoras > Plano de Contas: coluna "Origem Projeção" (pedido do usuário), como no
-- Plano Contas da DFC, no plano Global e nos planos próprios dos centros. É de onde a Projeção da DRE
-- (aba Projeções) vai tirar os valores futuros de cada natureza. Só 4 opções:
--   NAO_POSSUI                    NÃO POSSUI ORIGEM (a natureza não é projetada — ex.: NÃO ENTRA NA DRE)
--   HORIZON_ORCAMENTO_INFORMADO   HORIZON - INFORMADO (digitado no Horizon)
--   SIENGE_ORCAMENTO_EMPRESARIAL  SIENGE - EMPRESARIAL (orçamento empresarial do Sienge, rotina "Base do
--                                 orçamento empresarial (Sienge)" do Monitor de Integrações)
--   SIENGE_AGING                  SIENGE - AGING (títulos em aberto do Sienge)
-- Mesmos códigos da DFC (dfc_plano_contas.origem_projecao) onde a opção é a mesma. NULL = não informado.
--
-- A origem é independente da Máscara DRE: a linha passa a poder existir só com a origem (mascara_id
-- NULL e nao_entra FALSE = conta ainda sem Máscara DRE). Por isso o CHECK de antes ((mascara_id IS NULL)
-- = nao_entra) vira "NÃO ENTRA NA DRE não tem máscara", e apagar uma máscara na aba Máscaras limpa a
-- Máscara DRE da conta (SET NULL) em vez de apagar a linha — a origem fica.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-05-dre-plano-contas-origem.sql

BEGIN;

ALTER TABLE dre_plano_contas ADD COLUMN IF NOT EXISTS origem_projecao VARCHAR(40);
ALTER TABLE dre_plano_contas DROP CONSTRAINT IF EXISTS dre_plano_contas_origem_projecao_valida;
ALTER TABLE dre_plano_contas ADD CONSTRAINT dre_plano_contas_origem_projecao_valida
    CHECK (origem_projecao IN ('NAO_POSSUI', 'HORIZON_ORCAMENTO_INFORMADO', 'SIENGE_ORCAMENTO_EMPRESARIAL', 'SIENGE_AGING'));
ALTER TABLE dre_plano_contas DROP CONSTRAINT IF EXISTS dre_plano_contas_mascara_ou_nao_entra;
ALTER TABLE dre_plano_contas ADD CONSTRAINT dre_plano_contas_mascara_ou_nao_entra
    CHECK (NOT (nao_entra AND mascara_id IS NOT NULL));
ALTER TABLE dre_plano_contas DROP CONSTRAINT IF EXISTS dre_plano_contas_mascara_id_fkey;
ALTER TABLE dre_plano_contas ADD CONSTRAINT dre_plano_contas_mascara_id_fkey
    FOREIGN KEY (mascara_id) REFERENCES dre_mascaras(id) ON DELETE SET NULL;

ALTER TABLE dre_plano_contas_centro ADD COLUMN IF NOT EXISTS origem_projecao VARCHAR(40);
ALTER TABLE dre_plano_contas_centro DROP CONSTRAINT IF EXISTS dre_plano_contas_centro_origem_projecao_valida;
ALTER TABLE dre_plano_contas_centro ADD CONSTRAINT dre_plano_contas_centro_origem_projecao_valida
    CHECK (origem_projecao IN ('NAO_POSSUI', 'HORIZON_ORCAMENTO_INFORMADO', 'SIENGE_ORCAMENTO_EMPRESARIAL', 'SIENGE_AGING'));
ALTER TABLE dre_plano_contas_centro DROP CONSTRAINT IF EXISTS dre_plano_contas_centro_mascara_ou_nao_entra;
ALTER TABLE dre_plano_contas_centro ADD CONSTRAINT dre_plano_contas_centro_mascara_ou_nao_entra
    CHECK (NOT (nao_entra AND mascara_id IS NOT NULL));
ALTER TABLE dre_plano_contas_centro DROP CONSTRAINT IF EXISTS dre_plano_contas_centro_mascara_id_fkey;
ALTER TABLE dre_plano_contas_centro ADD CONSTRAINT dre_plano_contas_centro_mascara_id_fkey
    FOREIGN KEY (mascara_id) REFERENCES dre_mascaras(id) ON DELETE SET NULL;

COMMIT;
