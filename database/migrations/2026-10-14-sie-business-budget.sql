-- Orçamento Empresarial do Sienge (endpoint bulk-data/v1/business-budget) — mesmo padrão do
-- sie_income / sie_outcome: por empresa, cada sincronização apaga e reinsere tudo daquela empresa;
-- campos achatados 1:1 com a API (camelCase -> snake_case), listas aninhadas em tabelas filhas.
-- Usado pelo DFC Construtoras (Orçamentos): o valor de cada natureza "SIENGE - EMPRESARIAL
-- DESEMBOLSO" no mês do orçamento, espalhado pelo cronograma de desembolso da natureza (ficha de
-- desembolso), só da última versão (versionNumber) de cada orçamento.
-- Rotina "Base do orçamento empresarial (Sienge)" do Monitor de Integrações.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-sie-business-budget.sql

-- Um orçamento (uma versão dele). A mesma `id` pode vir em várias versões — por isso a linha tem
-- id próprio (registro_id). As datas vêm como texto solto na API — guardadas como vieram.
CREATE TABLE IF NOT EXISTS sie_business_budget (
    registro_id          SERIAL PRIMARY KEY,
    empresa_id           INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    id                   BIGINT,
    start_date           VARCHAR(30),
    end_date             VARCHAR(30),
    base_date            VARCHAR(30),
    description          VARCHAR(500),
    budget_type          VARCHAR(100),
    vision               VARCHAR(100),
    company_id           BIGINT,
    company_name         VARCHAR(255),
    cost_center_id       BIGINT,
    cost_center_name     VARCHAR(255),
    department_id        BIGINT,
    department_name      VARCHAR(255),
    version_number       INTEGER,
    version_description  VARCHAR(500),
    api_error            TEXT,             -- campo "api-error" da API
    criado_em            TIMESTAMP DEFAULT NOW(),
    atualizado_em        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sie_business_budget_empresa ON sie_business_budget (empresa_id, cost_center_id);
CREATE INDEX IF NOT EXISTS idx_sie_business_budget_versao ON sie_business_budget (empresa_id, id, version_number);

-- Naturezas financeiras orçadas (paymentCategories) de cada orçamento.
CREATE TABLE IF NOT EXISTS sie_business_budget_categorias (
    categoria_id   SERIAL PRIMARY KEY,
    registro_id    INTEGER NOT NULL REFERENCES sie_business_budget(registro_id) ON DELETE CASCADE,
    id             VARCHAR(50),       -- a natureza (código do plano financeiro)
    description    VARCHAR(255),
    type           VARCHAR(50),
    notes          TEXT
);

CREATE INDEX IF NOT EXISTS idx_sie_business_budget_categorias_registro ON sie_business_budget_categorias (registro_id);

-- Valor orçado mês a mês (interval) de cada natureza. `month_year` como veio da API; `mes` é o
-- primeiro dia daquele mês, lido dele na gravação (null se o formato não for reconhecido).
CREATE TABLE IF NOT EXISTS sie_business_budget_valores (
    valor_id       SERIAL PRIMARY KEY,
    categoria_id   INTEGER NOT NULL REFERENCES sie_business_budget_categorias(categoria_id) ON DELETE CASCADE,
    month_year     VARCHAR(20),
    mes            DATE,
    total_price    NUMERIC(18,2)
);

CREATE INDEX IF NOT EXISTS idx_sie_business_budget_valores_categoria ON sie_business_budget_valores (categoria_id);
