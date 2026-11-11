-- Gestão de Cobranças › Configurações › "Usuário Administrador": por empresa, quem está à direita é
-- Administrador da Gestão de Cobranças (vê e altera todas as abas: Motor de Risco, Comunicação, Régua de
-- Cobrança, Clientes, Configurações; e a Rotina de todos); quem não está é Comum (só Rotinas — a própria —,
-- Gestão das Parcelas e Clusters de Clientes). Master é sempre Administrador. Sem nenhuma linha, só o
-- Master administra. Ver backend/src/modules/cobranca-acesso.
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-11-11-cobranca-administradores.sql

CREATE TABLE IF NOT EXISTS cobranca_administradores (
    empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (empresa_id, usuario_id)
);
