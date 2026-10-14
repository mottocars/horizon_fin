-- DFC Construtoras > Plano Contas: ficha de desembolso de cada natureza com Origem Projeção
-- "SIENGE - EMPRESARIAL DESEMBOLSO" — como o contas a pagar dessa natureza costuma ser pago
-- (parcelas por título, prazo emissão x vencimento, padrões, maiores credores, curva de
-- desembolso por mês). Calculada quando a conta recebe essa origem (e pelo "Recalcular") a partir
-- dos títulos emitidos nos últimos 12 meses, e guardada pra ser mostrada sempre que precisar.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-dfc-desembolso-fichas.sql

CREATE TABLE IF NOT EXISTS dfc_desembolso_fichas (
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    sienge_id      INTEGER NOT NULL,             -- a natureza (conta do plano)
    periodo_de     DATE NOT NULL,                -- emissão dos títulos considerados
    periodo_ate    DATE NOT NULL,
    titulos        INTEGER NOT NULL,
    parcelas       INTEGER NOT NULL,
    valor          NUMERIC(18,2) NOT NULL,
    prazo_medio    NUMERIC(8,1),                 -- dias emissão -> vencimento, ponderado pelo valor ("Prazo Desembolso")
    prazo_mediano  INTEGER,
    ficha          JSONB NOT NULL,               -- o resto da ficha (distribuições, padrões, credores, curva)
    usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    calculado_em   TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (empresa_id, sienge_id)
);
