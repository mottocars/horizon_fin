-- Operações > DFC Construtoras > aba Máscaras: a estrutura da DFC de cada empresa, em 2
-- níveis — nível 1 (ex.: FLUXO DE CAIXA OPERACIONAL) e nível 2 dentro dele (ex.: RECEITA DE
-- VENDAS). Diferente da DRE (nível 1 fixo no código, ver estruturaDre.js), aqui o nível 1 é
-- cadastrado pelo usuário, e tudo pode ser reordenado arrastando — inclusive um item de nível 2
-- virar nível 1 (ou o contrário) ou mudar de grupo. `parent_id` NULL = nível 1. O limite de 2
-- níveis é garantido no backend (dfc-mascaras.service.js). `ordem` é a posição entre irmãos
-- (sem UNIQUE: a reordenação regrava a estrutura inteira de uma vez).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-13-dfc-mascaras.sql

CREATE TABLE IF NOT EXISTS dfc_mascaras (
    id            SERIAL PRIMARY KEY,
    empresa_id    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    parent_id     INTEGER REFERENCES dfc_mascaras(id) ON DELETE CASCADE,
    ordem         INTEGER NOT NULL,
    descricao     VARCHAR(150) NOT NULL,
    criado_em     TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW(),
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_dfc_mascaras_empresa ON dfc_mascaras (empresa_id, parent_id, ordem);

DROP TRIGGER IF EXISTS trg_dfc_mascaras_atualizado_em ON dfc_mascaras;
CREATE TRIGGER trg_dfc_mascaras_atualizado_em
    BEFORE UPDATE ON dfc_mascaras
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
