-- Extrato das contas bancárias do Sienge (endpoint v1/accounts-statements), conta a conta — só as
-- contas com "Projeta DFC" na aba Contas Correntes do DFC Construtoras. Cada sincronização busca a
-- base completa da conta (de 01/01/2000 até o início do mês atual) e substitui a que estava
-- gravada pra ela. O saldo de uma conta numa data = soma dos lançamentos (entradas − saídas) até ali
-- — é o Saldo Inicial do fluxo de caixa (aba DFC).
-- Campos achatados 1:1 com a API; budgetCategories (só percentual + links) fica como veio, em JSON.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-sie-extrato-contas.sql

CREATE TABLE IF NOT EXISTS sie_extrato_contas (
    registro_id            SERIAL PRIMARY KEY,
    empresa_id             INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    company_id             INTEGER NOT NULL,
    numero_conta           VARCHAR(20) NOT NULL,
    id                     BIGINT,
    value                  NUMERIC(18,2),
    date                   DATE,
    document_number        VARCHAR(100),
    description            VARCHAR(500),
    document_id            VARCHAR(50),
    type                   VARCHAR(30),
    reconciliation_date    DATE,
    bill_id                BIGINT,
    installment_number     INTEGER,
    statement_origin       VARCHAR(30),
    statement_type         VARCHAR(100),
    statement_type_notes   VARCHAR(500),
    budget_categories      JSONB,
    criado_em              TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (numero_conta, empresa_id, company_id)
        REFERENCES contas_bancarias_sienge (numero_conta, empresa_id, company_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sie_extrato_contas_conta ON sie_extrato_contas (empresa_id, company_id, numero_conta, date);

-- Quando cada conta foi buscada por último (e quantos lançamentos vieram) — situação na tela.
CREATE TABLE IF NOT EXISTS sie_extrato_contas_sincronizacoes (
    empresa_id      INTEGER NOT NULL,
    company_id      INTEGER NOT NULL,
    numero_conta    VARCHAR(20) NOT NULL,
    data_ate        DATE NOT NULL,          -- endDate usado na busca
    lancamentos     INTEGER NOT NULL,
    sincronizado_em TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (empresa_id, company_id, numero_conta),
    FOREIGN KEY (numero_conta, empresa_id, company_id)
        REFERENCES contas_bancarias_sienge (numero_conta, empresa_id, company_id) ON DELETE CASCADE
);
