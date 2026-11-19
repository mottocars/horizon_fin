-- Operações > DRE Construtoras > aba Versões (pedido do usuário, 19/11/2026): a DRE passa a ser publicada
-- por versão. Sem versão aberta nada da DRE pode ser alterado; a versão salva (FECHADA) guarda uma cópia de
-- tudo o que a DRE lê (configuração das abas, cadastros de fora como a natureza do centro, e o realizado do
-- Sienge) em schemas próprios do Postgres (dre_vc_<id> = configuração, dre_vr_<id> = realizado) — ver
-- backend/src/modules/dre-versoes. Dashboard, MCP, Excel do dashboard e Reforma Tributária leem a última
-- versão salva; a tela de Operações lê a versão aberta (ou, sem ela, a última salva).
--   - Gerar nova versão (origem NOVA): realizado até o último mês fechado (corte), ao vivo enquanto aberta
--     (o Monitor de Integrações continua atualizando); a cópia do realizado é tirada ao salvar.
--   - Editar última versão (origem EDICAO): o realizado fica o da versão editada (mesma cópia, mesmo corte).
--   - A primeira versão de cada empresa (INICIAL) é criada já salva com o estado do dia.
--   - Ficam só as 10 últimas versões salvas: ao salvar a 11ª, a mais antiga é apagada (com as cópias).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-19-dre-versoes.sql

BEGIN;

CREATE TABLE IF NOT EXISTS dre_versoes (
    id               SERIAL PRIMARY KEY,
    empresa_id       INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    numero           INTEGER NOT NULL,
    status           VARCHAR(10) NOT NULL CHECK (status IN ('ABERTA', 'FECHADA')),
    origem           VARCHAR(10) NOT NULL CHECK (origem IN ('INICIAL', 'NOVA', 'EDICAO')),
    -- Último mês do realizado (dia 1); do mês seguinte em diante, só projeção.
    corte            DATE NOT NULL CHECK (EXTRACT(DAY FROM corte) = 1),
    -- A versão salva de onde esta saiu (NULL na INICIAL).
    base_id          INTEGER REFERENCES dre_versoes(id) ON DELETE SET NULL,
    -- Schemas das cópias: realizado (NULL enquanto uma NOVA está aberta — o realizado é o de hoje) e
    -- configuração (só nas salvas). A EDICAO usa a cópia do realizado da versão editada.
    foto_realizado   VARCHAR(63),
    foto_config      VARCHAR(63),
    aberta_por       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    aberta_por_nome  TEXT,
    -- Relógio da aplicação (o do Postgres da VPS é deslocado).
    aberta_em        TIMESTAMPTZ NOT NULL,
    fechada_por      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    fechada_por_nome TEXT,
    fechada_em       TIMESTAMPTZ,
    UNIQUE (empresa_id, numero)
);
-- Uma versão aberta por empresa, no máximo.
CREATE UNIQUE INDEX IF NOT EXISTS dre_versoes_uma_aberta ON dre_versoes (empresa_id) WHERE status = 'ABERTA';

-- O carimbo de cada alteração feita com a versão aberta (drilldown Versão › Módulo › Usuário › Alteração).
-- usuario_id/usuario_nome NULL = alterado fora da DRE (detectado ao salvar, comparando com a versão anterior).
CREATE TABLE IF NOT EXISTS dre_versao_alteracoes (
    id            SERIAL PRIMARY KEY,
    versao_id     INTEGER NOT NULL REFERENCES dre_versoes(id) ON DELETE CASCADE,
    -- A aba alterada: centros-custos, mascaras, plano-de-contas, orcamento, unidades, financeiro,
    -- configuracoes, projecoes (ou versoes, pros próprios eventos da versão).
    modulo        VARCHAR(30) NOT NULL,
    usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario_nome  TEXT,
    criado_em     TIMESTAMPTZ NOT NULL,
    descricao     TEXT NOT NULL,
    -- { antes, depois, ... } — o que mudou, pra conferência.
    detalhes      JSONB,
    -- Junta edições seguidas do mesmo item pelo mesmo usuário numa linha só (ex.: o assistente da Projeção
    -- grava a cada mudança).
    chave         TEXT
);
CREATE INDEX IF NOT EXISTS dre_versao_alteracoes_versao ON dre_versao_alteracoes (versao_id, modulo, usuario_id);

-- O projetado de cada versão salva (do mês seguinte ao corte em diante), por centro e mês — o "Projetado"
-- dos meses que fecharam depois vem da última versão em que eles ainda eram projeção.
CREATE TABLE IF NOT EXISTS dre_versao_projetado (
    versao_id  INTEGER NOT NULL REFERENCES dre_versoes(id) ON DELETE CASCADE,
    centro_id  INTEGER NOT NULL,
    mes        CHAR(7) NOT NULL,
    valores    JSONB NOT NULL,
    PRIMARY KEY (versao_id, centro_id, mes)
);

-- Gatilho das tabelas copiadas nos schemas das versões: a cópia é só leitura.
CREATE OR REPLACE FUNCTION dre_versao_somente_leitura() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'A cópia de uma versão salva da DRE é só leitura.';
END
$$;

-- As versões só da Projeção (aba Projeções, "Salvar versão") deram lugar às versões da DRE: cada centro fica
-- com um orçamento só (versao_id NULL). Se havia versão salva, fica o orçamento da última dela onde o centro
-- não tem rascunho.
DELETE FROM dre_projecao_orcamentos o
 WHERE o.versao_id IS NOT NULL
   AND (EXISTS (SELECT 1 FROM dre_projecao_orcamentos r WHERE r.empresa_id = o.empresa_id AND r.centro_id = o.centro_id AND r.versao_id IS NULL)
        OR o.versao_id <> (SELECT v.id FROM dre_projecao_versoes v WHERE v.empresa_id = o.empresa_id ORDER BY v.numero DESC LIMIT 1));
UPDATE dre_projecao_orcamentos SET versao_id = NULL WHERE versao_id IS NOT NULL;
DELETE FROM dre_projecao_versoes;

COMMIT;
