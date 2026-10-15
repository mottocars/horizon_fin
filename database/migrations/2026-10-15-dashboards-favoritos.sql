-- Dashboards: a tela favorita (estrela) de cada usuário em cada dashboard — é a que abre ao entrar no
-- dashboard pelo menu; sem favorita, abre a primeira da lista (pedido do usuário).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-15-dashboards-favoritos.sql

CREATE TABLE IF NOT EXISTS usuarios_dashboard_favoritos (
    usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    dashboard      VARCHAR(60) NOT NULL,   -- ex.: 'economico-financeiro'
    tela           VARCHAR(60) NOT NULL,   -- ex.: 'aging'
    atualizado_em  TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (usuario_id, dashboard)
);
