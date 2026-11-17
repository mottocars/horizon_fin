-- Login com Horizon (OIDC) para os aplicativos parceiros da loja — ver backend/src/modules/parceiros/oidc.js.
--
-- O Horizon é o provedor de identidade: o parceiro pergunta "quem é este usuário?" pelo fluxo
-- Authorization Code e recebe um id_token assinado com um identificador fixo (sub). O vínculo
-- entre esse sub e a conta do usuário no sistema do parceiro (e o que ele pode fazer lá) fica
-- todo com o parceiro.
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-11-17-parceiros-oidc.sql

BEGIN;

-- Chaves RSA que assinam os tokens (a pública vai em /v1/oauth/jwks). A privada fica criptografada
-- (utils/crypto.js). Gerada sozinha na primeira vez; trocar = inserir outra ativa e desativar a antiga
-- (a antiga continua no JWKS enquanto ativa = false e publicada = true).
CREATE TABLE IF NOT EXISTS oidc_chaves (
    kid         VARCHAR(40) PRIMARY KEY,
    privada     TEXT NOT NULL,
    publica     JSONB NOT NULL,
    ativa       BOOLEAN NOT NULL DEFAULT TRUE,
    publicada   BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS oidc_chaves_uma_ativa ON oidc_chaves (ativa) WHERE ativa;

-- Identificador do usuário do Horizon para cada parceiro (o "sub" do id_token): fixo, aleatório e
-- diferente em cada parceiro (um parceiro não consegue cruzar usuários com outro).
CREATE TABLE IF NOT EXISTS parceiros_usuarios (
    parceiro_id      INTEGER NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
    usuario_id       INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    sub              VARCHAR(40) NOT NULL UNIQUE,
    logins           INTEGER NOT NULL DEFAULT 0,
    ultimo_login_em  TIMESTAMPTZ,
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (parceiro_id, usuario_id)
);

-- Código de autorização (60 segundos, uso único). Só o SHA-256 do código.
CREATE TABLE IF NOT EXISTS oidc_codigos (
    codigo_hash     CHAR(64) PRIMARY KEY,
    parceiro_id     INTEGER NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
    usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    redirect_uri    TEXT NOT NULL,
    scope           TEXT NOT NULL,
    nonce           TEXT,
    code_challenge  VARCHAR(128),
    expira_em       TIMESTAMPTZ NOT NULL,
    usado_em        TIMESTAMPTZ,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS oidc_codigos_expira ON oidc_codigos (expira_em);

COMMIT;
