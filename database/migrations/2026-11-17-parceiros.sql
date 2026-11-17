-- Parceiros (loja de aplicativos do Horizon) — ver backend/src/modules/parceiros.
--
-- 1. O parceiro preenche "Quero ser um Parceiro" em api.horizonhub.com.br: o pedido fica em
--    parceiros_verificacoes até ele digitar o código que a Comunicação Oficial mandou por WhatsApp.
-- 2. Código certo → vira uma linha de parceiros (EM_ANALISE) e aparece em Cadastros › Parceiros.
-- 3. Aprovado → client_id + client_secret TEMPORÁRIO (6 dias, uso único) por WhatsApp; o parceiro
--    troca o temporário pelo client_secret OFICIAL em POST /v1/parceiros/client-secret (mostrado
--    uma vez só). No banco fica só o SHA-256 dos dois segredos.
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-11-17-parceiros.sql

BEGIN;

-- Pedido ainda sem o código do WhatsApp confirmado (apagado ao confirmar ou depois de 1 dia).
CREATE TABLE IF NOT EXISTS parceiros_verificacoes (
    token          VARCHAR(64) PRIMARY KEY,
    dados          JSONB NOT NULL,
    logo           BYTEA NOT NULL,
    telefone       VARCHAR(20) NOT NULL,
    codigo_hash    TEXT NOT NULL,
    tentativas     SMALLINT NOT NULL DEFAULT 0,
    envios         SMALLINT NOT NULL DEFAULT 1,
    enviado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expira_em      TIMESTAMPTZ NOT NULL,
    ip             VARCHAR(64),
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parceiros (
    id                              SERIAL PRIMARY KEY,
    status                          VARCHAR(12) NOT NULL DEFAULT 'EM_ANALISE'
                                    CHECK (status IN ('EM_ANALISE', 'APROVADO', 'RECUSADO', 'SUSPENSO')),
    responsavel_nome                VARCHAR(120) NOT NULL,
    responsavel_email               VARCHAR(160) NOT NULL,
    responsavel_telefone            VARCHAR(20) NOT NULL,
    telefone_confirmado_em          TIMESTAMPTZ,
    app_nome                        VARCHAR(22) NOT NULL,
    app_descricao                   VARCHAR(140) NOT NULL,
    logo                            BYTEA NOT NULL,
    logo_largura                    INTEGER,
    logo_altura                     INTEGER,
    logo_tamanho                    INTEGER,
    url_abertura                    VARCHAR(500) NOT NULL,
    url_callback                    VARCHAR(500) NOT NULL,
    -- Verificações automáticas: [{ id, titulo, ok, detalhe, informativo }]
    verificacoes                    JSONB,
    verificado_em                   TIMESTAMPTZ,
    client_id                       VARCHAR(40) UNIQUE,
    secret_temporario_hash          CHAR(64),
    secret_temporario_gerado_em     TIMESTAMPTZ,
    secret_temporario_expira_em     TIMESTAMPTZ,
    secret_temporario_usado_em      TIMESTAMPTZ,
    secret_oficial_hash             CHAR(64),
    secret_oficial_gerado_em        TIMESTAMPTZ,
    -- Motivo da recusa ou da suspensão (o último).
    motivo                          VARCHAR(500),
    ip_solicitacao                  VARCHAR(64),
    criado_em                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_parceiros_status ON parceiros (status);

-- Histórico de cada parceiro (solicitação, aprovação, credenciais, suspensão...).
CREATE TABLE IF NOT EXISTS parceiros_eventos (
    id           SERIAL PRIMARY KEY,
    parceiro_id  INTEGER NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
    tipo         VARCHAR(30) NOT NULL,
    detalhe      TEXT,
    usuario_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_parceiros_eventos_parceiro ON parceiros_eventos (parceiro_id, criado_em);

COMMIT;
