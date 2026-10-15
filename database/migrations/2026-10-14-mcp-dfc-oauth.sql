-- MCP do DFC Construtoras (pedido do usuário): conector MCP com a flag "DFC CONSTRUTORAS" — só
-- ferramentas do DFC — e autenticação por login do Horizon Fin (OAuth 2.1 com PKCE e registro
-- dinâmico de cliente, o padrão dos "custom connectors" do Claude). O login vale `sessao_horas`;
-- depois disso o Claude pede para entrar de novo. Ver backend/src/modules/integracoes-mcp/dfc.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-mcp-dfc-oauth.sql

ALTER TABLE integracoes_mcp ADD COLUMN IF NOT EXISTS escopo VARCHAR(30) NOT NULL DEFAULT 'COBRANCA';
ALTER TABLE integracoes_mcp DROP CONSTRAINT IF EXISTS integracoes_mcp_escopo_check;
ALTER TABLE integracoes_mcp ADD CONSTRAINT integracoes_mcp_escopo_check CHECK (escopo IN ('COBRANCA', 'DFC_CONSTRUTORAS'));
-- Duração do login (só conectores DFC): quanto tempo o acesso do Claude vale depois de entrar.
ALTER TABLE integracoes_mcp ADD COLUMN IF NOT EXISTS sessao_horas INTEGER NOT NULL DEFAULT 24;
ALTER TABLE integracoes_mcp DROP CONSTRAINT IF EXISTS integracoes_mcp_sessao_horas_check;
ALTER TABLE integracoes_mcp ADD CONSTRAINT integracoes_mcp_sessao_horas_check CHECK (sessao_horas BETWEEN 1 AND 720);

-- Clientes OAuth registrados dinamicamente (RFC 7591) — o Claude se registra sozinho.
CREATE TABLE IF NOT EXISTS mcp_oauth_clientes (
    client_id      VARCHAR(64) PRIMARY KEY,
    client_name    VARCHAR(200),
    redirect_uris  JSONB NOT NULL,
    criado_em      TIMESTAMPTZ NOT NULL
);

-- Códigos de autorização (uso único, 5 minutos), com o desafio PKCE (S256).
CREATE TABLE IF NOT EXISTS mcp_oauth_codigos (
    code_hash       CHAR(64) PRIMARY KEY,
    client_id       VARCHAR(64) NOT NULL REFERENCES mcp_oauth_clientes(client_id) ON DELETE CASCADE,
    conector_id     INTEGER NOT NULL REFERENCES integracoes_mcp(id) ON DELETE CASCADE,
    usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    redirect_uri    TEXT NOT NULL,
    code_challenge  VARCHAR(128) NOT NULL,
    expira_em       TIMESTAMPTZ NOT NULL,
    usado_em        TIMESTAMPTZ
);

-- Sessões (um login no Claude): token de acesso (1 hora, renovável) e de renovação, ambos só como
-- hash SHA-256. `sessao_expira_em` = login + sessao_horas do conector: depois disso nada renova.
-- Datas gravadas com o relógio da aplicação (o do Postgres da VPS é deslocado).
CREATE TABLE IF NOT EXISTS mcp_oauth_sessoes (
    id                SERIAL PRIMARY KEY,
    conector_id       INTEGER NOT NULL REFERENCES integracoes_mcp(id) ON DELETE CASCADE,
    usuario_id        INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    client_id         VARCHAR(64) NOT NULL REFERENCES mcp_oauth_clientes(client_id) ON DELETE CASCADE,
    access_hash       CHAR(64) NOT NULL UNIQUE,
    refresh_hash      CHAR(64) NOT NULL UNIQUE,
    access_expira_em  TIMESTAMPTZ NOT NULL,
    sessao_expira_em  TIMESTAMPTZ NOT NULL,
    criado_em         TIMESTAMPTZ NOT NULL,
    ultimo_uso_em     TIMESTAMPTZ,
    revogada_em       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_sessoes_conector ON mcp_oauth_sessoes (conector_id);

-- Views da ferramenta de SQL livre do MCP do DFC (mesmo esquema das mcp_* da cobrança: cada uma filtra
-- a empresa por current_setting('app.empresa_id'), definida pela ferramenta na mesma transação).
CREATE OR REPLACE VIEW mcp_dfc_centros_custo AS
    SELECT * FROM centros_custo_sienge WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_naturezas AS
    SELECT * FROM planos_financeiros_sienge WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_mascaras AS
    SELECT * FROM dfc_mascaras WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_plano_contas AS
    SELECT * FROM dfc_plano_contas WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_plano_contas_centro AS
    SELECT * FROM dfc_plano_contas_centro WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_contas_bancarias AS
    SELECT * FROM contas_bancarias_sienge WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_extrato AS
    SELECT * FROM sie_extrato_contas WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_extrato_rateio AS
    SELECT * FROM sie_extrato_contas_rateio WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_orcamento_valores AS
    SELECT * FROM dfc_orcamento_valores WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_orcamento_versoes AS
    SELECT * FROM dfc_orcamento_versoes WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_orcamento_log AS
    SELECT * FROM dfc_orcamento_log WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_orcamento_informado AS
    SELECT * FROM dfc_orcamento_informado WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_projecao_cef AS
    SELECT * FROM dfc_projecao_cef WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_parametros AS
    SELECT * FROM dfc_parametros_versoes WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_avanco_manual AS
    SELECT * FROM dfc_avanco_manual WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_unidades_caixa AS
    SELECT * FROM extrato_unidades WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_contas_pagar AS
    SELECT * FROM sie_outcome WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_contas_pagar_categorias AS
    SELECT * FROM sie_outcome_categorias WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_contas_receber AS
    SELECT * FROM sie_income WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_contas_receber_categorias AS
    SELECT * FROM sie_income_categorias WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_desembolso_fichas AS
    SELECT * FROM dfc_desembolso_fichas WHERE empresa_id = current_setting('app.empresa_id', true)::int;
CREATE OR REPLACE VIEW mcp_dfc_orcamento_empresarial AS
    SELECT b.empresa_id, b.registro_id, b.id AS orcamento_id, b.version_number, b.description AS orcamento,
           b.cost_center_id, b.cost_center_name, c.id AS natureza_id, c.description AS natureza, c.type AS tipo_linha,
           v.month_year, v.mes, v.total_price
      FROM sie_business_budget b
      JOIN sie_business_budget_categorias c ON c.registro_id = b.registro_id
      JOIN sie_business_budget_valores v ON v.categoria_id = c.categoria_id
     WHERE b.empresa_id = current_setting('app.empresa_id', true)::int;
