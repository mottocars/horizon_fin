-- Relatórios > Métricas de Uso: "Como cada usuário acessa" — de onde vêm as
-- chamadas autenticadas à API (navegador, celular, Postman, script Python...).
-- Agregado por usuário + dia + cliente (User-Agent) + IP, pra não gravar 1
-- linha por requisição. `assinatura` = md5(user_agent|ip), só pra caber no UNIQUE.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-06-logs-acesso-clientes.sql
CREATE TABLE IF NOT EXISTS logs_acesso_clientes (
    id            SERIAL PRIMARY KEY,
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    dia           DATE NOT NULL,
    tipo          VARCHAR(30) NOT NULL,
    detalhe       VARCHAR(120),
    user_agent    TEXT NOT NULL DEFAULT '',
    ip            VARCHAR(64),
    assinatura    CHAR(32) NOT NULL,
    total         INTEGER NOT NULL DEFAULT 0,
    primeiro_em   TIMESTAMP NOT NULL DEFAULT NOW(),
    ultimo_em     TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (usuario_id, dia, assinatura)
);

CREATE INDEX IF NOT EXISTS idx_logs_acesso_clientes_dia ON logs_acesso_clientes (dia);
