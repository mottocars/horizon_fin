-- Operações > DRE Gerencial > aba Fração Ideal: as unidades dos empreendimentos, do endpoint /units
-- do Sienge — mesma lógica dos contratos do Repasses CEF (sie_sales_contracts): busca paginada
-- (limit 200, offset incremental) e, a cada sincronização, apaga tudo da empresa e reinsere.
-- Tabela própria (e não unidades_sienge) porque aquela guarda valores editados à mão no Mapa de
-- Unidades / Períodos / Curva de Vendas, que o "apaga e reinsere" destruiria.
-- `enterprise_id` = sienge_id do centro de custo (centros_custo_sienge).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-23-sie-units.sql

CREATE TABLE IF NOT EXISTS sie_units (
    sienge_unit_id                BIGINT NOT NULL,
    empresa_id                    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    enterprise_id                 BIGINT,
    contract_id                   BIGINT,
    indexer_id                    BIGINT,
    name                          VARCHAR(255),
    property_type                 VARCHAR(100),
    note                          TEXT,
    commercial_stock              VARCHAR(20),
    latitude                      VARCHAR(50),
    longitude                     VARCHAR(50),
    legal_registration_number     VARCHAR(100),
    delivery_date                 DATE,
    scheduled_delivery_date       DATE,
    private_area                  NUMERIC(18,4),
    common_area                   NUMERIC(18,4),
    terrain_area                  NUMERIC(18,4),
    non_proportional_common_area  NUMERIC(18,4),
    ideal_fraction                NUMERIC(18,8),
    ideal_fraction_square_meter   NUMERIC(18,8),
    general_sale_value_fraction   NUMERIC(18,8),
    indexed_quantity              NUMERIC(18,4),
    prized_compliance             NUMERIC(18,4),
    terrain_value                 NUMERIC(18,2),
    floor                         VARCHAR(100),
    contract_number               VARCHAR(100),
    usable_area                   NUMERIC(18,4),
    iptu_value                    NUMERIC(18,2),
    real_estate_registration      VARCHAR(100),
    cib_code                      VARCHAR(100),
    incra_code                    VARCHAR(100),
    location_type                 VARCHAR(10),
    framework_type                INTEGER,
    evaluation_date               DATE,
    evaluation_price              NUMERIC(18,2),
    sale_value_date               DATE,
    sale_value_price              NUMERIC(18,2),
    address_city_id               BIGINT,
    address_city                  VARCHAR(150),
    address_street_name           VARCHAR(255),
    address_complement            VARCHAR(255),
    address_number                VARCHAR(50),
    address_neighborhood          VARCHAR(150),
    address_zip_code              VARCHAR(20),
    address_street_type           INTEGER,
    child_units                   JSONB,
    groupings                     JSONB,
    special_values                JSONB,
    links                         JSONB,
    criado_em                     TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (sienge_unit_id, empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_sie_units_empresa_enterprise ON sie_units (empresa_id, enterprise_id);
