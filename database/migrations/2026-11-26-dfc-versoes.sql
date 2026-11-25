-- Operações > DFC Construtoras > aba Versões (pedido do usuário, 25/11/2026): a DFC passa a ser publicada por
-- versão, com a mesma lógica da DRE (2026-11-19-dre-versoes.sql). Sem versão aberta nada da DFC pode ser
-- alterado; a versão salva (FECHADA) guarda uma cópia do que a DFC lê em schemas próprios do Postgres
-- (dfc_vc_<id> = configuração e Orçamento consolidado, dfc_vr_<id> = realizado do extrato) — ver
-- backend/src/modules/dfc-versoes. O dashboard Fluxo de Caixa, o MCP, o Excel do dashboard e o Impacto DFC
-- da Reforma Tributária leem a última versão APROVADA (Matriz de Alçadas › DFC › Aprovador; sem Aprovador, a
-- versão é publicada ao salvar); a tela de Operações lê a versão aberta (ou, sem ela, a última salva).
--   - Gerar nova versão (NOVA): realizado até o último mês fechado (corte = mês anterior), ao vivo enquanto
--     aberta; a cópia do realizado é tirada ao salvar.
--   - Editar última versão (EDICAO): o realizado fica o da versão editada (mesma cópia, mesmo corte).
--   - A primeira versão de cada empresa (INICIAL) é criada já salva e aprovada pelo "Sistema" com o estado do dia.
--   - Ficam só as 10 últimas versões salvas (nunca a publicada).
--   - O "Salvar Versão" do Orçamento (aba Projeções) virou "Gerar orçamento": recalcula o Orçamento dentro da
--     versão aberta da DFC (dfc_orcamento_versoes passa a ser só o registro de cada geração, com a versão
--     da DFC em que foi feita); o número que vale é o da versão da DFC.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-26-dfc-versoes.sql

BEGIN;

CREATE TABLE IF NOT EXISTS dfc_versoes (
    id                 SERIAL PRIMARY KEY,
    empresa_id         INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    numero             INTEGER NOT NULL,
    status             VARCHAR(10) NOT NULL CHECK (status IN ('ABERTA', 'FECHADA')),
    origem             VARCHAR(10) NOT NULL CHECK (origem IN ('INICIAL', 'NOVA', 'EDICAO')),
    -- Último mês do realizado (dia 1); do mês seguinte em diante, só projeção.
    corte              DATE NOT NULL CHECK (EXTRACT(DAY FROM corte) = 1),
    base_id            INTEGER REFERENCES dfc_versoes(id) ON DELETE SET NULL,
    foto_realizado     VARCHAR(63),
    foto_config        VARCHAR(63),
    aberta_por         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    aberta_por_nome    TEXT,
    -- Relógio da aplicação (o do Postgres da VPS é deslocado).
    aberta_em          TIMESTAMPTZ NOT NULL,
    fechada_por        INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    fechada_por_nome   TEXT,
    fechada_em         TIMESTAMPTZ,
    aprovada_por       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    aprovada_por_nome  TEXT,
    aprovada_em        TIMESTAMPTZ,
    reprovada_por      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    reprovada_por_nome TEXT,
    reprovada_em       TIMESTAMPTZ,
    reprovacao_motivo  TEXT,
    UNIQUE (empresa_id, numero)
);
CREATE UNIQUE INDEX IF NOT EXISTS dfc_versoes_uma_aberta ON dfc_versoes (empresa_id) WHERE status = 'ABERTA';

-- O carimbo de cada alteração feita com a versão aberta (drilldown Versão › Módulo › Usuário › Alteração).
-- usuario_id/usuario_nome NULL = alterado fora da DFC (detectado ao salvar, comparando com a versão anterior).
CREATE TABLE IF NOT EXISTS dfc_versao_alteracoes (
    id            SERIAL PRIMARY KEY,
    versao_id     INTEGER NOT NULL REFERENCES dfc_versoes(id) ON DELETE CASCADE,
    -- A aba alterada (id da aba da DFC: orcamentos, mascaras, plano-contas, centros-custos, ...) ou versoes.
    modulo        VARCHAR(30) NOT NULL,
    usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario_nome  TEXT,
    criado_em     TIMESTAMPTZ NOT NULL,
    descricao     TEXT NOT NULL,
    detalhes      JSONB,
    chave         TEXT
);
CREATE INDEX IF NOT EXISTS dfc_versao_alteracoes_versao ON dfc_versao_alteracoes (versao_id, modulo, usuario_id);

-- Cada "Gerar orçamento" (antigo "Salvar Versão" do Orçamento) fica ligado à versão da DFC em que foi feito.
-- SET NULL (e não CASCADE): apagar uma versão nunca leva junto o Orçamento consolidado (dfc_orcamento_valores
-- aponta pras gerações). Só o "Excluir rascunho" apaga as gerações feitas nele, explicitamente, depois de o
-- Orçamento voltar ao da versão base (dfc-versoes/dfcVersoes.service.js::excluir).
ALTER TABLE dfc_orcamento_versoes
    ADD COLUMN IF NOT EXISTS dfc_versao_id INTEGER REFERENCES dfc_versoes(id) ON DELETE SET NULL;
ALTER TABLE dfc_orcamento_versoes DROP CONSTRAINT IF EXISTS dfc_orcamento_versoes_dfc_versao_id_fkey;
ALTER TABLE dfc_orcamento_versoes
    ADD CONSTRAINT dfc_orcamento_versoes_dfc_versao_id_fkey FOREIGN KEY (dfc_versao_id) REFERENCES dfc_versoes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS dfc_orcamento_versoes_dfc_versao ON dfc_orcamento_versoes (dfc_versao_id);

-- Gatilho das tabelas copiadas nos schemas das versões da DFC: a cópia é só leitura.
CREATE OR REPLACE FUNCTION dfc_versao_somente_leitura() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'A cópia de uma versão salva da DFC é só leitura.';
END
$$;

COMMIT;
