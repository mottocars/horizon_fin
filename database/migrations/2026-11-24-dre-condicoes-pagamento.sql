-- Condições de pagamento dos contratos de venda (Operações > DRE Gerencial > aba Configurações):
--
-- sie_sales_contracts_payment_conditions — as condições de pagamento de cada contrato (paymentConditions
--   do /sales-contracts do Sienge: ATO, CHAVES, PARCELA MENSAL, DESCONTO - CONCEDIDO…), uma linha por
--   condição, na ordem em que a API devolve (`linha`). Preenchida na mesma sincronização dos contratos
--   (repassesCef.service.js::inserirContrato) e apagada junto com o contrato (CASCADE).
-- dre_condicoes_excluidas — condições de pagamento (sigla do Sienge: AT, CH, PM, DE…) que NÃO entram na
--   DRE: o valor delas sai do valor do contrato (aba Unidades → receita, ticket médio). Só as excluídas
--   ficam gravadas, então condição nova que chegar do Sienge entra sempre considerada (à esquerda na tela)
--   — o mesmo molde de dre_documentos_excluidos.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-24-dre-condicoes-pagamento.sql
-- (depois, atualizar os contratos — aba Unidades, Repasses CEF ou Monitor de Integrações — pra preencher).

BEGIN;

CREATE TABLE IF NOT EXISTS sie_sales_contracts_payment_conditions (
    sienge_contract_id                BIGINT NOT NULL,
    empresa_id                        INTEGER NOT NULL,
    linha                             INTEGER NOT NULL,   -- posição na lista paymentConditions do contrato
    condition_type_id                 VARCHAR(20),
    condition_type_name               VARCHAR(255),
    bearer_id                         BIGINT,
    bearer_name                       VARCHAR(255),
    indexer_id                        BIGINT,
    indexer_name                      VARCHAR(255),
    interest_type                     VARCHAR(20),
    match_maturities                  VARCHAR(20),
    installments_number               INTEGER,
    open_installments_number          INTEGER,
    months_grace_period               INTEGER,
    grace_period_type                 VARCHAR(50),
    first_payment                     DATE,
    base_date                         DATE,
    base_date_interest                DATE,
    total_value                       NUMERIC(18,2),
    outstanding_balance               NUMERIC(18,2),
    interest_percentage               NUMERIC(10,4),
    total_value_interest              NUMERIC(18,2),
    amount_paid                       NUMERIC(18,2),
    sequence_id                       INTEGER,
    order_number                      INTEGER,
    order_number_remade_installments  INTEGER,
    status                            VARCHAR(50),
    paid_before_contract_additive     BOOLEAN,
    title_condition_type_divergent    BOOLEAN,
    status_situacao                   VARCHAR(50),
    PRIMARY KEY (sienge_contract_id, empresa_id, linha),
    FOREIGN KEY (sienge_contract_id, empresa_id)
        REFERENCES sie_sales_contracts (sienge_contract_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sie_sales_contracts_payment_conditions_tipo
    ON sie_sales_contracts_payment_conditions (empresa_id, condition_type_id);

CREATE TABLE IF NOT EXISTS dre_condicoes_excluidas (
    empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    condicao    VARCHAR(20) NOT NULL,   -- sigla, sem espaços (TRIM do conditionTypeId)
    usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em   TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, condicao)
);

COMMIT;
