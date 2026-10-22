-- Operações > DRE Gerencial > Máscaras: de onde vem o valor de cada linha de nível 2 — por
-- enquanto só informativo (nenhum cálculo usa ainda), igual às marcações de
-- 2026-10-22-dre-mascaras-flags.sql (rodar esta depois daquela):
--   origem  — só nível 2: 'CONTRATOS_VENDAS' (Sienge - Contratos de Vendas),
--             'UNIDADES_IMOBILIARIAS' (Sienge - Unidades Imobiliárias),
--             'FINANCEIRO' (Sienge - Financeiro CP/CR/Extrato) ou 'IMPOSTO_FIXO' (Imposto Fixo — sem
--             cálculo; a alíquota vem do histórico, abaixo). Pode ficar vazia.
--   calculo — só com origem, e só um dos cálculos dela:
--               CONTRATOS_VENDAS      → VALOR_VENDAS, ESTORNO_VENDAS, RECEITA_DISTRATO
--               UNIDADES_IMOBILIARIAS → RECEITA_PERMUTA
--               FINANCEIRO            → ENTRADAS_SAIDAS, CORRECAO_MONETARIA
--             Trocar ou limpar a origem limpa o cálculo (o backend faz junto, no mesmo UPDATE).
-- Ao arrastar pro nível 1, o backend limpa as duas.
--
-- dre_mascaras_imposto_historico — alíquotas da máscara com origem IMPOSTO_FIXO, cada uma valendo
-- a partir de um mês (inicio = dia 1). O fim não é gravado: cada histórico vale até o mês anterior
-- ao início do seguinte (o último fica vigente) — por isso criar um novo "fecha" o anterior.
-- Trocar a origem não apaga o histórico (volta a aparecer se escolher Imposto Fixo de novo).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-22-dre-mascaras-origem-calculo.sql

ALTER TABLE dre_mascaras ADD COLUMN IF NOT EXISTS origem  VARCHAR(30);
ALTER TABLE dre_mascaras ADD COLUMN IF NOT EXISTS calculo VARCHAR(30);

ALTER TABLE dre_mascaras DROP CONSTRAINT IF EXISTS dre_mascaras_origem_valida;
ALTER TABLE dre_mascaras ADD CONSTRAINT dre_mascaras_origem_valida
    CHECK (origem IS NULL OR (parent_id IS NOT NULL
           AND origem IN ('CONTRATOS_VENDAS', 'UNIDADES_IMOBILIARIAS', 'FINANCEIRO', 'IMPOSTO_FIXO')));

ALTER TABLE dre_mascaras DROP CONSTRAINT IF EXISTS dre_mascaras_calculo_valido;
ALTER TABLE dre_mascaras ADD CONSTRAINT dre_mascaras_calculo_valido
    CHECK (calculo IS NULL
        OR (origem = 'CONTRATOS_VENDAS' AND calculo IN ('VALOR_VENDAS', 'ESTORNO_VENDAS', 'RECEITA_DISTRATO'))
        OR (origem = 'UNIDADES_IMOBILIARIAS' AND calculo = 'RECEITA_PERMUTA')
        OR (origem = 'FINANCEIRO' AND calculo IN ('ENTRADAS_SAIDAS', 'CORRECAO_MONETARIA')));

CREATE TABLE IF NOT EXISTS dre_mascaras_imposto_historico (
    id         SERIAL PRIMARY KEY,
    mascara_id INTEGER NOT NULL REFERENCES dre_mascaras(id) ON DELETE CASCADE,
    inicio     DATE NOT NULL CHECK (EXTRACT(DAY FROM inicio) = 1),
    aliquota   NUMERIC(7, 4) NOT NULL CHECK (aliquota >= 0 AND aliquota <= 100),
    criado_em  TIMESTAMP DEFAULT NOW(),
    CONSTRAINT dre_mascaras_imposto_historico_inicio_unico UNIQUE (mascara_id, inicio)
);
