-- Operações > Cronogramas Obras > aba Etapas: as etapas de obra de cada empresa, num nível só
-- (mesmo cadastro da aba Máscaras da DFC, mas sem nível 2 — pedido do usuário). `ordem` é a
-- posição na lista (sem UNIQUE: a reordenação regrava a lista inteira de uma vez).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-20-cronograma-etapas.sql

CREATE TABLE IF NOT EXISTS cronograma_etapas (
    id            SERIAL PRIMARY KEY,
    empresa_id    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    ordem         INTEGER NOT NULL,
    descricao     VARCHAR(150) NOT NULL,
    criado_em     TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cronograma_etapas_empresa ON cronograma_etapas (empresa_id, ordem);

DROP TRIGGER IF EXISTS trg_cronograma_etapas_atualizado_em ON cronograma_etapas;
CREATE TRIGGER trg_cronograma_etapas_atualizado_em
    BEFORE UPDATE ON cronograma_etapas
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
