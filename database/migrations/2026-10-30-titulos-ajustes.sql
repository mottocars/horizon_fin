-- Ajustes de títulos do contas a receber / a pagar do Sienge, sem mexer no título original
-- (sie_income / sie_outcome e as categorias continuam como vieram da integração). Genérico — não é
-- da DRE: hoje a DRE Gerencial › Financeiro usa, outras telas podem ler os mesmos ajustes depois.
--
-- titulos_ajustes          — um por título ajustado (empresa + origem + bill_id): o título inteiro,
--                            todas as parcelas.
-- titulos_ajustes_rateio   — as linhas que SUBSTITUEM o rateio original do título (centro de custo ×
--                            natureza × valor). Valor positivo, do jeito que o título vale (a receber:
--                            original − impostos retidos; a pagar: original); quem lê aplica o sinal.
-- titulos_ajustes_historico — cada gravação ou restauração, com quem fez, quando e o antes/depois
--                            (JSON), pra rastrear o que foi alterado.
-- Apagar o ajuste (restaurar o original) apaga o título e as linhas; o histórico fica.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-30-titulos-ajustes.sql

BEGIN;

CREATE TABLE IF NOT EXISTS titulos_ajustes (
    id             SERIAL PRIMARY KEY,
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    origem         CHAR(1) NOT NULL CHECK (origem IN ('R', 'P')),  -- R contas a receber, P contas a pagar
    bill_id        BIGINT NOT NULL,
    observacao     TEXT,
    usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em      TIMESTAMP DEFAULT NOW(),
    atualizado_em  TIMESTAMP DEFAULT NOW(),
    CONSTRAINT titulos_ajustes_titulo_unico UNIQUE (empresa_id, origem, bill_id)
);

DROP TRIGGER IF EXISTS trg_titulos_ajustes_atualizado_em ON titulos_ajustes;
CREATE TRIGGER trg_titulos_ajustes_atualizado_em
    BEFORE UPDATE ON titulos_ajustes
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TABLE IF NOT EXISTS titulos_ajustes_rateio (
    id           SERIAL PRIMARY KEY,
    ajuste_id    INTEGER NOT NULL REFERENCES titulos_ajustes(id) ON DELETE CASCADE,
    centro_id    INTEGER,          -- centros_custo_sienge.sienge_id (null = sem centro)
    natureza_id  VARCHAR(20),      -- planos_financeiros_sienge.sienge_id, como texto (null = sem natureza)
    valor        NUMERIC(18, 2) NOT NULL CHECK (valor > 0)
);

CREATE INDEX IF NOT EXISTS idx_titulos_ajustes_rateio_ajuste ON titulos_ajustes_rateio (ajuste_id);

CREATE TABLE IF NOT EXISTS titulos_ajustes_historico (
    id          SERIAL PRIMARY KEY,
    empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    origem      CHAR(1) NOT NULL CHECK (origem IN ('R', 'P')),
    bill_id     BIGINT NOT NULL,
    acao        VARCHAR(10) NOT NULL CHECK (acao IN ('AJUSTOU', 'RESTAUROU')),
    antes       JSONB,             -- linhas e observação antes (null = estava original)
    depois      JSONB,             -- linhas e observação depois (null = voltou ao original)
    usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_titulos_ajustes_historico_titulo ON titulos_ajustes_historico (empresa_id, origem, bill_id, criado_em);

COMMIT;
