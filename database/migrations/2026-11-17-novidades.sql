-- Cadastros › Novidades: novidades do sistema que aparecem numa janela ao entrar (uma vez por
-- usuário) e no botão "Novidades" do topo (ver backend/src/modules/novidades).
--   publico = TODOS    → todos os usuários do sistema (só Master pode escolher);
--   publico = EMPRESAS → as empresas de novidades_empresas: todos os usuários da empresa
--                        (todos_usuarios) ou só os de novidades_usuarios.
-- Master vê todas. O GIF explicativo fica no próprio banco (midia BYTEA).
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-11-17-novidades.sql
-- Depois (uma vez): node backend/scripts/novidades-iniciais.js — as 2 primeiras novidades com os GIFs.

BEGIN;

CREATE TABLE IF NOT EXISTS novidades (
    id             SERIAL PRIMARY KEY,
    nome           VARCHAR(150) NOT NULL,
    descricao      TEXT NOT NULL DEFAULT '',
    publico        VARCHAR(10) NOT NULL DEFAULT 'EMPRESAS' CHECK (publico IN ('TODOS', 'EMPRESAS')),
    midia          BYTEA,
    midia_tipo     VARCHAR(60),
    midia_nome     VARCHAR(255),
    midia_tamanho  INTEGER,
    criado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS novidades_empresas (
    novidade_id     INTEGER NOT NULL REFERENCES novidades(id) ON DELETE CASCADE,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    todos_usuarios  BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (novidade_id, empresa_id)
);

CREATE TABLE IF NOT EXISTS novidades_usuarios (
    novidade_id  INTEGER NOT NULL,
    empresa_id   INTEGER NOT NULL,
    usuario_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    PRIMARY KEY (novidade_id, empresa_id, usuario_id),
    FOREIGN KEY (novidade_id, empresa_id) REFERENCES novidades_empresas(novidade_id, empresa_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_novidades_usuarios_usuario ON novidades_usuarios (usuario_id);

CREATE TABLE IF NOT EXISTS novidades_vistas (
    novidade_id  INTEGER NOT NULL REFERENCES novidades(id) ON DELETE CASCADE,
    usuario_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    vista_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (novidade_id, usuario_id)
);

COMMIT;
