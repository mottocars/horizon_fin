-- Cadastros > Matriz de Alçadas (pedido do usuário, 19/11/2026): por empresa e classificação (por enquanto só
-- DRE), quem responde por cada item (por enquanto só "Aprovador"). Na DRE, a versão salva fica aguardando a
-- aprovação do Aprovador e só depois de aprovada vira a publicada (dashboard, MCP, Excel do dashboard, Reforma
-- Tributária) — backend/src/modules/dre-versoes e modules/matriz-alcadas.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-19-matriz-alcadas.sql

BEGIN;

CREATE TABLE IF NOT EXISTS matriz_alcadas (
    id             SERIAL PRIMARY KEY,
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    -- A área (DRE) e o item dela (APROVADOR) — listas em modules/matriz-alcadas/matrizAlcadas.service.js.
    classificacao  VARCHAR(30) NOT NULL,
    item           VARCHAR(30) NOT NULL,
    usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    -- Relógio da aplicação (o do Postgres da VPS é deslocado).
    atualizado_em  TIMESTAMPTZ NOT NULL,
    UNIQUE (empresa_id, classificacao, item)
);

-- Aprovação da versão da DRE: a publicada é a última versão salva E aprovada.
ALTER TABLE dre_versoes
    ADD COLUMN IF NOT EXISTS aprovada_por      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS aprovada_por_nome TEXT,
    ADD COLUMN IF NOT EXISTS aprovada_em       TIMESTAMPTZ;

-- As versões salvas antes da aprovação existir ficam aprovadas por quem as salvou (continuam publicadas).
UPDATE dre_versoes
   SET aprovada_por = fechada_por, aprovada_por_nome = fechada_por_nome, aprovada_em = fechada_em
 WHERE status = 'FECHADA' AND aprovada_em IS NULL;

COMMIT;
