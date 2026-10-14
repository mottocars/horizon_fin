-- Contas a pagar do Sienge (endpoint bulk-data/v1/outcome) — mesmo padrão do sie_income: por
-- empresa, cada sincronização apaga e reinsere tudo daquela empresa; parcela identificada por
-- billId+installmentId dentro do tenant; campos achatados 1:1 com a API (camelCase -> snake_case),
-- sem coluna JSON — as listas aninhadas viram tabelas filhas cascateadas por FK.
-- Usado pelo Aging a pagar do DFC Construtoras (Orçamentos, contas com Origem Projeção
-- "SIENGE - AGING"). Rotina "Base do contas a pagar (Sienge)" do Monitor de Integrações.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-sie-outcome.sql

CREATE TABLE IF NOT EXISTS sie_outcome (
    bill_id                       BIGINT NOT NULL,
    installment_id                BIGINT NOT NULL,
    empresa_id                    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    company_id                    BIGINT,
    company_name                  VARCHAR(255),
    business_area_id              BIGINT,
    business_area_name            VARCHAR(255),
    project_id                    BIGINT,
    project_name                  VARCHAR(255),
    group_company_id              BIGINT,
    group_company_name            VARCHAR(255),
    holding_id                    BIGINT,
    holding_name                  VARCHAR(255),
    subsidiary_id                 BIGINT,
    subsidiary_name               VARCHAR(255),
    business_type_id              BIGINT,
    business_type_name            VARCHAR(255),
    creditor_id                   BIGINT,
    creditor_name                 VARCHAR(255),
    document_identification_id    VARCHAR(50),
    document_identification_name  VARCHAR(255),
    document_number               VARCHAR(100),
    forecast_document             VARCHAR(20),
    consistency_status            VARCHAR(50),
    origin_id                     VARCHAR(50),
    original_amount               NUMERIC(18,2),
    discount_amount               NUMERIC(18,2),
    tax_amount                    NUMERIC(18,2),
    indexer_id                    BIGINT,
    indexer_name                  VARCHAR(255),
    due_date                      DATE,
    issue_date                    DATE,
    installment_base_date         DATE,
    balance_amount                NUMERIC(18,2),
    corrected_balance_amount      NUMERIC(18,2),
    authorization_status          VARCHAR(50),
    bill_date                     DATE,
    registered_user_id            VARCHAR(100),
    registered_by                 VARCHAR(255),
    registered_date               TIMESTAMPTZ,
    criado_em                     TIMESTAMP DEFAULT NOW(),
    atualizado_em                 TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (bill_id, installment_id, empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_sie_outcome_empresa ON sie_outcome (empresa_id);
CREATE INDEX IF NOT EXISTS idx_sie_outcome_creditor ON sie_outcome (empresa_id, creditor_id);
CREATE INDEX IF NOT EXISTS idx_sie_outcome_due_date ON sie_outcome (empresa_id, due_date);

-- Rateio por categoria financeira/centro de custo (paymentsCategories) de cada parcela.
CREATE TABLE IF NOT EXISTS sie_outcome_categorias (
    id                          SERIAL PRIMARY KEY,
    bill_id                     BIGINT NOT NULL,
    installment_id              BIGINT NOT NULL,
    empresa_id                  INTEGER NOT NULL,
    cost_center_id              BIGINT,
    cost_center_name            VARCHAR(255),
    project_id                  BIGINT,
    project_name                VARCHAR(255),
    financial_category_id       VARCHAR(50),
    financial_category_name     VARCHAR(255),
    financial_category_reducer  VARCHAR(20),
    financial_category_type     VARCHAR(50),
    financial_category_rate     NUMERIC(10,4),
    FOREIGN KEY (bill_id, installment_id, empresa_id)
        REFERENCES sie_outcome (bill_id, installment_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sie_outcome_categorias_parcela ON sie_outcome_categorias (bill_id, installment_id, empresa_id);
CREATE INDEX IF NOT EXISTS idx_sie_outcome_categorias_centro ON sie_outcome_categorias (empresa_id, cost_center_id, financial_category_id);

-- Rateio por departamento (departamentsCosts — "departaments" é o nome real do campo na API).
CREATE TABLE IF NOT EXISTS sie_outcome_departamentos (
    id                 SERIAL PRIMARY KEY,
    bill_id            BIGINT NOT NULL,
    installment_id     BIGINT NOT NULL,
    empresa_id         INTEGER NOT NULL,
    departament_id     BIGINT,
    departament_name   VARCHAR(255),
    rate               NUMERIC(10,4),
    FOREIGN KEY (bill_id, installment_id, empresa_id)
        REFERENCES sie_outcome (bill_id, installment_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sie_outcome_departamentos_parcela ON sie_outcome_departamentos (bill_id, installment_id, empresa_id);

-- Apropriação por obra / unidade / item de orçamento (buildingsCosts).
CREATE TABLE IF NOT EXISTS sie_outcome_obras (
    id                           SERIAL PRIMARY KEY,
    bill_id                      BIGINT NOT NULL,
    installment_id               BIGINT NOT NULL,
    empresa_id                   INTEGER NOT NULL,
    building_id                  BIGINT,
    building_name                VARCHAR(255),
    building_unit_id             BIGINT,
    building_unit_name           VARCHAR(255),
    cost_estimation_sheet_id     VARCHAR(100),
    cost_estimation_sheet_name   VARCHAR(255),
    rate                         NUMERIC(10,4),
    FOREIGN KEY (bill_id, installment_id, empresa_id)
        REFERENCES sie_outcome (bill_id, installment_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sie_outcome_obras_parcela ON sie_outcome_obras (bill_id, installment_id, empresa_id);

-- Pagamentos (payments) já baixados de cada parcela.
CREATE TABLE IF NOT EXISTS sie_outcome_pagamentos (
    id                           SERIAL PRIMARY KEY,
    bill_id                      BIGINT NOT NULL,
    installment_id               BIGINT NOT NULL,
    empresa_id                   INTEGER NOT NULL,
    operation_type_id            BIGINT,
    operation_type_name          VARCHAR(255),
    gross_amount                 NUMERIC(18,2),
    monetary_correction_amount   NUMERIC(18,2),
    interest_amount              NUMERIC(18,2),
    fine_amount                  NUMERIC(18,2),
    discount_amount              NUMERIC(18,2),
    tax_amount                   NUMERIC(18,2),
    net_amount                   NUMERIC(18,2),
    calculation_date             DATE,
    payment_date                 DATE,
    sequencial_number            INTEGER,
    corrected_net_amount         NUMERIC(18,2),
    payment_authentication       VARCHAR(255),
    FOREIGN KEY (bill_id, installment_id, empresa_id)
        REFERENCES sie_outcome (bill_id, installment_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sie_outcome_pagamentos_parcela ON sie_outcome_pagamentos (bill_id, installment_id, empresa_id);
CREATE INDEX IF NOT EXISTS idx_sie_outcome_pagamentos_pagamento ON sie_outcome_pagamentos (empresa_id, payment_date);

-- Movimentos bancários (bankMovements) de cada pagamento. Aqui a conta (accountCompanyId,
-- accountNumber, accountType) vem no movimento, não no pagamento como no income.
CREATE TABLE IF NOT EXISTS sie_outcome_pagamentos_movimentos (
    id                   SERIAL PRIMARY KEY,
    pagamento_id         INTEGER NOT NULL REFERENCES sie_outcome_pagamentos(id) ON DELETE CASCADE,
    account_company_id   BIGINT,
    account_number       VARCHAR(50),
    account_type         VARCHAR(50),
    bank_movement_date   DATE,
    sequencial_number    INTEGER,
    -- Id do movimento no Sienge (fidelidade com a API) — a linha é identificada pelo id (SERIAL).
    bank_movement_id     BIGINT,
    amount               NUMERIC(18,2),
    historic_id          BIGINT,
    historic_name        VARCHAR(255),
    operation_id         BIGINT,
    operation_name       VARCHAR(255),
    operation_type       VARCHAR(50),
    reconcile            VARCHAR(10),
    origin_id            VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_sie_outcome_pagamentos_movimentos_pagamento
    ON sie_outcome_pagamentos_movimentos (pagamento_id);

-- Rateio por categoria financeira do movimento bancário (paymentCategories dentro de bankMovements).
CREATE TABLE IF NOT EXISTS sie_outcome_pagamentos_movimentos_categorias (
    id                          SERIAL PRIMARY KEY,
    movimento_id                INTEGER NOT NULL REFERENCES sie_outcome_pagamentos_movimentos(id) ON DELETE CASCADE,
    cost_center_id              BIGINT,
    -- Não está no exemplo da documentação, mas a resposta real devolve (visto ao vivo).
    cost_center_name            VARCHAR(255),
    financial_category_id       VARCHAR(50),
    financial_category_name     VARCHAR(255),
    financial_category_reducer  VARCHAR(20),
    financial_category_type     VARCHAR(50),
    financial_category_rate     NUMERIC(10,4),
    bank_movement_id            BIGINT
);

CREATE INDEX IF NOT EXISTS idx_sie_outcome_pagamentos_movimentos_categorias_movimento
    ON sie_outcome_pagamentos_movimentos_categorias (movimento_id);

-- Autorizações (authorizations) da parcela. authorizationDate vem como "string" solto na API —
-- guardado como texto, como o interest_base_date do income.
CREATE TABLE IF NOT EXISTS sie_outcome_autorizacoes (
    id                        SERIAL PRIMARY KEY,
    bill_id                   BIGINT NOT NULL,
    installment_id            BIGINT NOT NULL,
    empresa_id                INTEGER NOT NULL,
    authorization_user_id     VARCHAR(100),
    authorization_user_name   VARCHAR(255),
    authorization_date        VARCHAR(50),
    is_last_to_authorize      VARCHAR(10),
    FOREIGN KEY (bill_id, installment_id, empresa_id)
        REFERENCES sie_outcome (bill_id, installment_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sie_outcome_autorizacoes_parcela ON sie_outcome_autorizacoes (bill_id, installment_id, empresa_id);
