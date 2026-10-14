-- Extrato das contas já "achatado" por rateio (centro de custo × natureza financeira) — base do
-- REALIZADO do fluxo de caixa (aba DFC). Montado a cada sincronização do extrato (rotina "Saldos das
-- contas (Sienge)") a partir de sie_extrato_contas.budget_categories, com a mesma regra da query do
-- usuário: uma linha por categoria do lançamento (percentual do rateio, centro e natureza tirados dos
-- links "cost-center" / "payment-categories"); lançamento sem categoria entra com 100%; lançamento de
-- título (bill_id) sem centro/natureza herda o de outro lançamento do mesmo título na mesma data.
-- Gravado pronto pra a tela só somar (índice por empresa e mês) — sem refazer a query a cada abertura.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-sie-extrato-contas-rateio.sql

CREATE TABLE IF NOT EXISTS sie_extrato_contas_rateio (
    id             BIGSERIAL PRIMARY KEY,
    empresa_id     INTEGER NOT NULL,
    registro_id    INTEGER NOT NULL REFERENCES sie_extrato_contas(registro_id) ON DELETE CASCADE,
    company_id     INTEGER NOT NULL,
    numero_conta   VARCHAR(20) NOT NULL,
    data           DATE,
    mes            DATE,                    -- 1º dia do mês do lançamento
    centro_id      INTEGER,                 -- centro de custo (null = sem rateio)
    natureza_id    INTEGER,                 -- natureza financeira = conta do plano (null = sem natureza)
    percentual     NUMERIC(12,8) NOT NULL,
    valor          NUMERIC(20,6) NOT NULL   -- com sinal: entrada (Income) +, saída (Expense) −; 6 casas pra a soma do rateio bater com o lançamento
);

CREATE INDEX IF NOT EXISTS idx_sie_extrato_contas_rateio_mes ON sie_extrato_contas_rateio (empresa_id, mes);
CREATE INDEX IF NOT EXISTS idx_sie_extrato_contas_rateio_conta ON sie_extrato_contas_rateio (empresa_id, company_id, numero_conta);
