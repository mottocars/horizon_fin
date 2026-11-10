-- Cadastros > Contas Pagar / Receber (pedido do usuário, 10/11/2026): títulos a pagar e a receber
-- lançados no Horizon (não vêm da origem). Um título tem parcelas (vencimento e valor) e um rateio por
-- centro de custo e plano de contas (natureza), herdados dos cadastros da empresa
-- (centros_custo_sienge / planos_financeiros_sienge). Baixa simples por parcela (data e valor).
--
-- Tipo de documento: FINANCEIRO (o título completo) ou PROJECAO_PLS_CEF (o formulário dele ainda vai
-- ser criado; `dados` fica reservado para ele).
-- Datas gravadas com o relógio da aplicação (o do Postgres da VPS é deslocado) — por isso não há
-- DEFAULT now() nas colunas de data/hora.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-10-contas-pagar-receber.sql

BEGIN;

CREATE TABLE IF NOT EXISTS cpr_titulos (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    tipo            VARCHAR(7) NOT NULL CHECK (tipo IN ('PAGAR', 'RECEBER')),
    tipo_documento  VARCHAR(20) NOT NULL CHECK (tipo_documento IN ('FINANCEIRO', 'PROJECAO_PLS_CEF')),
    pessoa_id       BIGINT,                -- credor (a pagar) ou cliente (a receber) da origem
    pessoa_nome     VARCHAR(255),          -- nome no momento do cadastro
    documento       VARCHAR(50),
    data_emissao    DATE,
    historico       VARCHAR(255),
    valor           NUMERIC(18, 2) NOT NULL CHECK (valor >= 0),
    dados           JSONB,                 -- reservado (Projeção PLS CEF)
    criado_por      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    alterado_por    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em       TIMESTAMP NOT NULL,
    atualizado_em   TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cpr_titulos_empresa ON cpr_titulos (empresa_id);

CREATE TABLE IF NOT EXISTS cpr_parcelas (
    id           SERIAL PRIMARY KEY,
    titulo_id    INTEGER NOT NULL REFERENCES cpr_titulos(id) ON DELETE CASCADE,
    numero       SMALLINT NOT NULL,
    vencimento   DATE NOT NULL,
    valor        NUMERIC(18, 2) NOT NULL CHECK (valor > 0),
    data_baixa   DATE,
    valor_baixa  NUMERIC(18, 2) CHECK (valor_baixa > 0),
    baixado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    baixado_em   TIMESTAMP,
    UNIQUE (titulo_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_cpr_parcelas_vencimento ON cpr_parcelas (vencimento);

CREATE TABLE IF NOT EXISTS cpr_rateios (
    id           SERIAL PRIMARY KEY,
    titulo_id    INTEGER NOT NULL REFERENCES cpr_titulos(id) ON DELETE CASCADE,
    centro_id    INTEGER NOT NULL,        -- centros_custo_sienge.sienge_id
    natureza_id  VARCHAR(20) NOT NULL,    -- planos_financeiros_sienge.sienge_id, como texto
    percentual   NUMERIC(9, 6) NOT NULL CHECK (percentual > 0),
    valor        NUMERIC(18, 2) NOT NULL CHECK (valor > 0)
);

CREATE INDEX IF NOT EXISTS idx_cpr_rateios_titulo ON cpr_rateios (titulo_id);

COMMIT;
