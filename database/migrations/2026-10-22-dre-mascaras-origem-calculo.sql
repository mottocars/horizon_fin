-- Operações > DRE Gerencial > Máscaras: de onde vem o valor de cada linha de nível 2 — por
-- enquanto só informativo (nenhum cálculo usa ainda), igual às marcações de
-- 2026-10-22-dre-mascaras-flags.sql (rodar esta depois daquela):
--   origem  — só nível 2: 'CONTRATOS_VENDAS' (Sienge - Contratos de Vendas),
--             'UNIDADES_IMOBILIARIAS' (Sienge - Unidades Imobiliárias) ou
--             'FINANCEIRO' (Sienge - Financeiro CP/CR/Extrato). Pode ficar vazia.
--   calculo — só com origem, e só um dos cálculos dela:
--               CONTRATOS_VENDAS      → VALOR_VENDAS, ESTORNO_VENDAS, RECEITA_DISTRATO
--               UNIDADES_IMOBILIARIAS → RECEITA_PERMUTA
--               FINANCEIRO            → ENTRADAS_SAIDAS, CORRECAO_MONETARIA
--             Trocar ou limpar a origem limpa o cálculo (o backend faz junto, no mesmo UPDATE).
-- Ao arrastar pro nível 1, o backend limpa as duas.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-22-dre-mascaras-origem-calculo.sql

ALTER TABLE dre_mascaras ADD COLUMN IF NOT EXISTS origem  VARCHAR(30);
ALTER TABLE dre_mascaras ADD COLUMN IF NOT EXISTS calculo VARCHAR(30);

ALTER TABLE dre_mascaras DROP CONSTRAINT IF EXISTS dre_mascaras_origem_valida;
ALTER TABLE dre_mascaras ADD CONSTRAINT dre_mascaras_origem_valida
    CHECK (origem IS NULL OR (parent_id IS NOT NULL
           AND origem IN ('CONTRATOS_VENDAS', 'UNIDADES_IMOBILIARIAS', 'FINANCEIRO')));

ALTER TABLE dre_mascaras DROP CONSTRAINT IF EXISTS dre_mascaras_calculo_valido;
ALTER TABLE dre_mascaras ADD CONSTRAINT dre_mascaras_calculo_valido
    CHECK (calculo IS NULL
        OR (origem = 'CONTRATOS_VENDAS' AND calculo IN ('VALOR_VENDAS', 'ESTORNO_VENDAS', 'RECEITA_DISTRATO'))
        OR (origem = 'UNIDADES_IMOBILIARIAS' AND calculo = 'RECEITA_PERMUTA')
        OR (origem = 'FINANCEIRO' AND calculo IN ('ENTRADAS_SAIDAS', 'CORRECAO_MONETARIA')));
