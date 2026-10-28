-- Dashboards: filtros salvos de cada usuário numa tela de dashboard (Econômico Financeiro › Aging List,
-- botão "Gravar filtro" e a lista "Filtros salvos" da barra). Por empresa: os códigos de natureza,
-- cliente e fornecedor são os do Sienge daquela empresa. Gravar com um nome que já existe substitui.
-- `filtros`: o que a tela grava (ex.: { centros, documentos, naturezas, clientes, fornecedores, previsao }).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-28-dashboards-filtros-salvos.sql

CREATE TABLE IF NOT EXISTS usuarios_dashboard_filtros (
    id             SERIAL PRIMARY KEY,
    usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    dashboard      VARCHAR(60) NOT NULL,   -- ex.: 'economico-financeiro'
    tela           VARCHAR(60) NOT NULL,   -- ex.: 'aging'
    nome           VARCHAR(80) NOT NULL,
    filtros        JSONB NOT NULL,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (usuario_id, empresa_id, dashboard, tela, nome)
);
