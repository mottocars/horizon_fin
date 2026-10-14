-- DFC Construtoras > Orçamentos: "Salvar Versão" (pedido do usuário). O Orçamento passa a mostrar
-- o que foi consolidado na última versão salva; o que muda nas fontes (valor digitado, Projeção
-- CEF, Aging do Sienge, plano de contas) só aparece depois de salvar uma versão nova. Cada valor
-- (centro × conta × mês) que entra, muda ou sai numa versão ganha uma linha no log, com quem fez a
-- mudança na origem (pessoa que digitou / disparou a integração) e quando.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-dfc-orcamento-versoes.sql

-- Valor informado limpo vira NULL (em vez de apagar a linha), pra o log saber quem limpou e quando.
ALTER TABLE dfc_orcamento_informado ALTER COLUMN valor DROP NOT NULL;

CREATE TABLE IF NOT EXISTS dfc_orcamento_versoes (
    id           SERIAL PRIMARY KEY,
    empresa_id   INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    numero       INTEGER NOT NULL,
    usuario_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    -- Relógio da aplicação (o do Postgres da VPS é deslocado — ver monitor-integracoes/executor.js).
    criado_em    TIMESTAMPTZ NOT NULL,
    valores      INTEGER NOT NULL,   -- quantos valores a versão tem
    inclusoes    INTEGER NOT NULL,
    alteracoes   INTEGER NOT NULL,
    exclusoes    INTEGER NOT NULL,
    UNIQUE (empresa_id, numero)
);

-- Orçamento consolidado: os valores da última versão salva (o que a aba Orçamentos mostra).
CREATE TABLE IF NOT EXISTS dfc_orcamento_valores (
    empresa_id   INTEGER NOT NULL,
    centro_id    INTEGER NOT NULL,
    sienge_id    INTEGER NOT NULL,
    mes          DATE NOT NULL CHECK (EXTRACT(DAY FROM mes) = 1),
    valor        NUMERIC(18,2) NOT NULL,
    origem       VARCHAR(40),
    versao_id    INTEGER NOT NULL REFERENCES dfc_orcamento_versoes(id) ON DELETE CASCADE,
    PRIMARY KEY (empresa_id, centro_id, sienge_id, mes),
    FOREIGN KEY (centro_id, empresa_id) REFERENCES centros_custo_sienge(sienge_id, empresa_id) ON DELETE CASCADE
);

-- Log de alterações de cada valor: uma linha por valor que entrou (INCLUSAO), mudou (ALTERACAO) ou
-- saiu (EXCLUSAO) numa versão. `fonte`: MANUAL (digitado na aba), INTEGRACAO (Projeção CEF, Aging
-- do Sienge) ou PLANO (mudança no plano de contas — origem / Projeta DFC). `responsavel_*`: quem
-- fez a mudança na origem e quando (null em integração agendada); quem salvou a versão está nela.
CREATE TABLE IF NOT EXISTS dfc_orcamento_log (
    id               BIGSERIAL PRIMARY KEY,
    empresa_id       INTEGER NOT NULL,
    centro_id        INTEGER NOT NULL,
    sienge_id        INTEGER NOT NULL,
    mes              DATE NOT NULL,
    versao_id        INTEGER NOT NULL REFERENCES dfc_orcamento_versoes(id) ON DELETE CASCADE,
    tipo             VARCHAR(10) NOT NULL CHECK (tipo IN ('INCLUSAO', 'ALTERACAO', 'EXCLUSAO')),
    valor_anterior   NUMERIC(18,2),
    valor_novo       NUMERIC(18,2),
    origem           VARCHAR(40),
    fonte            VARCHAR(12) NOT NULL CHECK (fonte IN ('MANUAL', 'INTEGRACAO', 'PLANO')),
    fonte_descricao  VARCHAR(255),
    responsavel_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    responsavel_em   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dfc_orcamento_log_valor ON dfc_orcamento_log (empresa_id, centro_id, sienge_id, mes);
