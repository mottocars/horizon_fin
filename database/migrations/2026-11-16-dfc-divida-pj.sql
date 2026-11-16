-- DFC Construtoras › aba Dívida PJ: o valor da dívida PJ de cada centro de custo (os com "Projeta DFC"),
-- mês a mês — cadastro como o da aba Orçamento da DRE Gerencial (dre_orcamento_valores), com um valor só
-- por mês. `mes` é sempre o dia 1. Ver backend/src/modules/dfc-divida-pj.
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-11-16-dfc-divida-pj.sql

CREATE TABLE IF NOT EXISTS dfc_divida_pj (
    id            SERIAL PRIMARY KEY,
    empresa_id    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    sienge_id     INTEGER NOT NULL,
    mes           DATE NOT NULL CHECK (EXTRACT(DAY FROM mes) = 1),
    valor         NUMERIC(15,2) NOT NULL DEFAULT 0,
    criado_em     TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES centros_custo_sienge(sienge_id, empresa_id) ON DELETE CASCADE,
    UNIQUE (empresa_id, sienge_id, mes)
);
