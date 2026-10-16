-- Monitor de Integrações: parâmetros por empresa e rotina (pedido do usuário). Primeiro uso: "Saldos das
-- contas (Sienge)" com "Dias retroativos" — busca no Sienge só os últimos N dias e mantém o histórico
-- anterior já gravado (vazio = todo o histórico, desde 01/01/2000). Os parâmetros de cada rotina são
-- declarados em backend/src/modules/monitor-integracoes/rotinas.js (`parametros`).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-16-monitor-parametros.sql

CREATE TABLE IF NOT EXISTS monitor_integracoes_parametros (
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    rotina         VARCHAR(40) NOT NULL,
    parametros     JSONB NOT NULL DEFAULT '{}',
    atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_em  TIMESTAMPTZ,
    PRIMARY KEY (empresa_id, rotina)
);
