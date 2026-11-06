-- Operações > DRE Construtoras > aba Projeções (pedido do usuário): o orçamento (projeção futura) da
-- DRE, por centro de custo, montado num assistente em etapas (dre-projecoes no backend).
--
-- Um orçamento = um centro × um ciclo (mês de início e de fim). Até o mês da trava vale o realizado (a
-- DRE de hoje); do mês seguinte até o fim do ciclo, o projetado: vendas das unidades em estoque (mês e
-- valor), custos e despesas por natureza conforme a Origem Projeção do plano de contas do centro
-- (digitado, orçamento empresarial do Sienge pela data original, títulos do Sienge pela emissão) e a
-- correção monetária digitada. A POC e as demais linhas saem do mesmo motor da DRE realizada.
--
-- Versões como na DFC: o orçamento concluído fica como rascunho (versao_id NULL) até "Salvar versão",
-- que grava uma versão da EMPRESA com um orçamento por centro — os concluídos agora e, nos demais
-- centros, os da versão anterior. Um rascunho por centro de cada vez.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-05-dre-projecoes.sql

BEGIN;

CREATE TABLE IF NOT EXISTS dre_projecao_versoes (
    id           SERIAL PRIMARY KEY,
    empresa_id   INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    numero       INTEGER NOT NULL,
    usuario_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    -- Relógio da aplicação (o do Postgres da VPS é deslocado).
    criado_em    TIMESTAMPTZ NOT NULL,
    orcamentos   INTEGER NOT NULL,
    UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS dre_projecao_orcamentos (
    id             SERIAL PRIMARY KEY,
    empresa_id     INTEGER NOT NULL,
    centro_id      INTEGER NOT NULL,
    -- NULL = rascunho (em andamento ou concluído, aguardando "Salvar versão").
    versao_id      INTEGER REFERENCES dre_projecao_versoes(id) ON DELETE CASCADE,
    status         VARCHAR(12) NOT NULL DEFAULT 'EM_ANDAMENTO' CHECK (status IN ('EM_ANDAMENTO', 'CONCLUIDO')),
    -- Etapa do assistente em que parou (pra reabrir de onde estava).
    etapa          VARCHAR(20) NOT NULL DEFAULT 'centro',
    ciclo_inicio   DATE NOT NULL CHECK (EXTRACT(DAY FROM ciclo_inicio) = 1),
    ciclo_fim      DATE NOT NULL CHECK (EXTRACT(DAY FROM ciclo_fim) = 1),
    -- Último mês do realizado (dia 1); a projeção começa no mês seguinte. NULL = ainda não definido.
    trava          DATE CHECK (EXTRACT(DAY FROM trava) = 1),
    -- O que foi informado: { unidades: { chave: { mes, valor } }, valores: { natureza: { mes: valor } },
    -- correcao: { mes: valor } }.
    dados          JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Foto do cálculo ao concluir (totais do nível 1 no ciclo, linhas de nível 2 mês a mês, POCs e o
    -- que foi usado de cada origem) — é o que a versão guarda.
    resultado      JSONB,
    usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em      TIMESTAMPTZ NOT NULL,
    atualizado_em  TIMESTAMPTZ NOT NULL,
    concluido_em   TIMESTAMPTZ,
    CHECK (ciclo_fim >= ciclo_inicio),
    FOREIGN KEY (centro_id, empresa_id) REFERENCES centros_custo_sienge(sienge_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dre_projecao_orcamentos_versao ON dre_projecao_orcamentos (empresa_id, versao_id);
-- Um rascunho por centro.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dre_projecao_rascunho
    ON dre_projecao_orcamentos (empresa_id, centro_id) WHERE versao_id IS NULL;

COMMIT;
