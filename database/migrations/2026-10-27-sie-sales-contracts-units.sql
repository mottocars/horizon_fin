-- Unidades vendidas em cada contrato (salesContractUnits do /sales-contracts do Sienge) — mesmo
-- molde de sie_sales_contracts_customers, preenchida na mesma sincronização dos contratos (Repasses
-- CEF e aba Unidades da DRE Gerencial). É o elo contrato → unidade que sobrevive ao distrato:
-- sie_units.contract_id só guarda o contrato ATUAL da unidade, então uma unidade distratada que
-- voltou pro estoque (ou foi revendida) perderia o contrato cancelado sem esta tabela.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-27-sie-sales-contracts-units.sql
-- (depois, atualizar os contratos — Repasses CEF ou aba Unidades — pra preencher).

CREATE TABLE IF NOT EXISTS sie_sales_contracts_units (
    sienge_contract_id        BIGINT NOT NULL,
    empresa_id                INTEGER NOT NULL,
    unit_id                   BIGINT NOT NULL,
    name                      VARCHAR(255),
    main                      BOOLEAN,
    participation_percentage  NUMERIC(10,4),
    PRIMARY KEY (sienge_contract_id, empresa_id, unit_id),
    FOREIGN KEY (sienge_contract_id, empresa_id)
        REFERENCES sie_sales_contracts (sienge_contract_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sie_sales_contracts_units_unidade ON sie_sales_contracts_units (empresa_id, unit_id);
