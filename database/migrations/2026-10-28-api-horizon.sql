-- API Horizon (api.horizonhub.com.br): API pública para integrações de terceiros, organizada em
-- grupos de endpoints (o primeiro: notas fiscais do Espião NF-e/NFS-e). Ver backend/src/modules/api-horizon/.
--
-- Fluxo: cada usuário gera a SUA chave em Integrações > API Horizon (uma por usuário, presa a ele
-- e a uma empresa, com os grupos de endpoints que ele liberou); a integração troca a chave por um
-- TOKEN temporário (POST /v1/auth/token) e usa o token como Bearer nas consultas. Chave e token
-- só existem aqui como hash SHA-256.
--
-- Também em espiao_notas: CNPJ do emitente/destinatário lidos do XML (antes só a razão social) e
-- atualizado_em (última mudança de status — inativação, vínculo, evento fiscal), mantido por
-- gatilhos, para o filtro atualizadoDesde da API. Depois de aplicar, rodar
-- backend/scripts/preencher-cnpjs-notas.js para preencher os CNPJs das notas que já existem.
--
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-28-api-horizon.sql

BEGIN;

-- ---------- Chaves de API ----------
CREATE TABLE IF NOT EXISTS api_horizon_chaves (
    id             SERIAL PRIMARY KEY,
    usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,  -- dono: a API age com as permissões dele
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,  -- a chave só enxerga esta empresa
    prefixo        VARCHAR(16) NOT NULL,           -- início da chave, só pra reconhecer na tela
    chave_hash     CHAR(64) NOT NULL UNIQUE,       -- SHA-256 da chave (a chave em si não é guardada)
    grupos         TEXT[] NOT NULL DEFAULT '{}',   -- grupos de endpoints liberados (backend/src/modules/api-horizon/grupos.js)
    escopos        TEXT[] NOT NULL DEFAULT '{}',   -- permissões de escrita liberadas (ex.: notas:inativar)
    expira_em      TIMESTAMPTZ NOT NULL,
    ultimo_uso_em  TIMESTAMPTZ,
    revogada_em    TIMESTAMPTZ,                    -- revogada ou substituída por uma chave nova
    revogada_por   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Uma chave em uso por usuário: gerar outra revoga a anterior (ver chaves.service.js).
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_horizon_chaves_usuario ON api_horizon_chaves (usuario_id) WHERE revogada_em IS NULL;

-- ---------- Tokens temporários (Bearer) ----------
CREATE TABLE IF NOT EXISTS api_horizon_tokens (
    token_hash  CHAR(64) PRIMARY KEY,
    chave_id    INTEGER NOT NULL REFERENCES api_horizon_chaves(id) ON DELETE CASCADE,
    ip          VARCHAR(64),
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expira_em   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_horizon_tokens_expira ON api_horizon_tokens (expira_em);

-- ---------- Registro de chamadas (auditoria) ----------
CREATE TABLE IF NOT EXISTS api_horizon_requisicoes (
    id           BIGSERIAL PRIMARY KEY,
    chave_id     INTEGER REFERENCES api_horizon_chaves(id) ON DELETE SET NULL,
    usuario_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    metodo       VARCHAR(8) NOT NULL,
    rota         VARCHAR(300) NOT NULL,   -- caminho sem query string
    consulta     VARCHAR(1000),           -- query string (sem segredos: chave e token vão em cabeçalho)
    status       SMALLINT NOT NULL,
    ip           VARCHAR(64),
    user_agent   VARCHAR(300),
    duracao_ms   INTEGER,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_horizon_requisicoes_chave ON api_horizon_requisicoes (chave_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_api_horizon_requisicoes_criado ON api_horizon_requisicoes (criado_em);

-- ---------- espiao_notas: CNPJs e última mudança de status ----------
ALTER TABLE espiao_notas ADD COLUMN IF NOT EXISTS cnpj_emitente VARCHAR(14);
ALTER TABLE espiao_notas ADD COLUMN IF NOT EXISTS cnpj_destinatario VARCHAR(14);
ALTER TABLE espiao_notas ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ;

-- Notas que já existem: a mudança mais recente que dá pra reconstruir (captura, inativação,
-- vínculo, último evento fiscal). As colunas antigas são TIMESTAMP sem fuso no fuso do servidor.
UPDATE espiao_notas n
   SET atualizado_em = GREATEST(
         n.criado_em,
         n.inativada_em,
         (SELECT v.vinculado_em FROM espiao_notas_vinculos v WHERE v.nota_id = n.id),
         (SELECT max(e.criado_em) FROM espiao_notas_eventos e WHERE e.nota_id = n.id)
       ) AT TIME ZONE current_setting('TimeZone')
 WHERE n.atualizado_em IS NULL;
UPDATE espiao_notas SET atualizado_em = NOW() WHERE atualizado_em IS NULL;

ALTER TABLE espiao_notas ALTER COLUMN atualizado_em SET DEFAULT NOW();
ALTER TABLE espiao_notas ALTER COLUMN atualizado_em SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_espiao_notas_certificado_emissao ON espiao_notas (certificado_id, data_emissao);
CREATE INDEX IF NOT EXISTS idx_espiao_notas_atualizado ON espiao_notas (empresa_id, atualizado_em);

-- Mudança de status na própria nota (inativar/reativar, cancelamento e demais eventos fiscais).
CREATE OR REPLACE FUNCTION espiao_notas_marcar_atualizacao() RETURNS trigger AS $$
BEGIN
  IF NEW.inativa IS DISTINCT FROM OLD.inativa
     OR NEW.motivo_inativacao IS DISTINCT FROM OLD.motivo_inativacao
     OR NEW.situacao IS DISTINCT FROM OLD.situacao
     OR NEW.situacao_categoria IS DISTINCT FROM OLD.situacao_categoria
     OR NEW.apenas_resumo IS DISTINCT FROM OLD.apenas_resumo
     OR NEW.valor_total IS DISTINCT FROM OLD.valor_total THEN
    NEW.atualizado_em := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_espiao_notas_atualizacao ON espiao_notas;
CREATE TRIGGER trg_espiao_notas_atualizacao
  BEFORE UPDATE ON espiao_notas
  FOR EACH ROW EXECUTE FUNCTION espiao_notas_marcar_atualizacao();

-- Vincular, trocar ou desfazer o vínculo com o contas a pagar também é mudança de status.
CREATE OR REPLACE FUNCTION espiao_notas_vinculos_marcar_nota() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE espiao_notas SET atualizado_em = NOW() WHERE id = OLD.nota_id;
  ELSE
    UPDATE espiao_notas SET atualizado_em = NOW() WHERE id = NEW.nota_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_espiao_notas_vinculos_atualizacao ON espiao_notas_vinculos;
CREATE TRIGGER trg_espiao_notas_vinculos_atualizacao
  AFTER INSERT OR UPDATE OR DELETE ON espiao_notas_vinculos
  FOR EACH ROW EXECUTE FUNCTION espiao_notas_vinculos_marcar_nota();

COMMIT;
