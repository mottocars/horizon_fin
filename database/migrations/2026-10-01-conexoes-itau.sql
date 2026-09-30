-- Conexão API Itaú: troca a estrutura provisória (integracoes_itau / integracoes_itau_contas,
-- criadas vazias em 30/09/2026 e nunca usadas) pela tabela conexoes_itau.
-- Aplicar na VPS: docker exec -i horizonhub-db-1 psql -U postgres -d horizon_fin < database/migrations/2026-10-01-conexoes-itau.sql
BEGIN;

DROP TABLE IF EXISTS integracoes_itau_contas;
DROP TABLE IF EXISTS integracoes_itau;

CREATE TABLE IF NOT EXISTS conexoes_itau (
    id                        SERIAL PRIMARY KEY,
    empresa_id                INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome                      VARCHAR(150) NOT NULL,
    client_id                 VARCHAR(36) NOT NULL,
    cnpj                      VARCHAR(14) NOT NULL,
    -- Conta usada na API de extrato: agência(4) + "00" + conta(5) + DAC(1).
    agencia                   VARCHAR(4),
    conta                     VARCHAR(5),
    dac                       VARCHAR(1),
    -- Subject do CSR já sanitizado, exatamente como foi enviado (OU, L, ST). CN = client_id.
    razao_social              VARCHAR(64) NOT NULL,
    cidade                    VARCHAR(64) NOT NULL,
    uf                        VARCHAR(2) NOT NULL,
    chave_privada_enc         TEXT,
    certificado_pem           TEXT,
    client_secret_enc         TEXT,
    resposta_bruta_enc        TEXT,
    data_validade_certificado TIMESTAMP,
    status                    VARCHAR(20) NOT NULL DEFAULT 'GERANDO' CHECK (status IN (
                                'GERANDO', 'CERTIFICADO_ATIVO', 'AGUARDANDO_ESCOPOS', 'ATIVA',
                                'ERRO_ITAU', 'ERRO_PROCESSAMENTO', 'ERRO_TOKEN')),
    ultimo_erro_codigo        VARCHAR(20),   -- HTTP status do Itaú, ou TIMEOUT / REDE
    ativo                     BOOLEAN NOT NULL DEFAULT TRUE,
    criado_por                INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em                 TIMESTAMP DEFAULT NOW(),
    atualizado_em             TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conexoes_itau_empresa ON conexoes_itau (empresa_id);

COMMIT;
