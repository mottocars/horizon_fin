-- (pedido do usuário, 19/11/2026)
-- 1) DRE: o Aprovador também pode REPROVAR a última versão salva, com o motivo. A reprovada não é publicada; para
--    corrigir, edita-se a última versão (Editar última versão sai dela) e salva-se de novo.
-- 2) Workflows: cada workflow passa a ter TÓPICOS (passos) — cada um com o seu gatilho e a sua ação — em vez de um
--    gatilho e uma ação só. Ex.: "Pedir aprovação da versão da DRE" = salva → Aprovador; reprovada → Responsável
--    (com o motivo); aprovada → Responsável. Os workflows que já existiam viram um tópico só.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-19-dre-reprovacao-workflow-topicos.sql

BEGIN;

ALTER TABLE dre_versoes
    ADD COLUMN IF NOT EXISTS reprovada_por      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reprovada_por_nome TEXT,
    ADD COLUMN IF NOT EXISTS reprovada_em       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reprovacao_motivo  TEXT;

-- passos: [{ gatilho, acao }] — acao como antes ({ tipo: 'WHATSAPP', conexao_id, destinatarios, mensagem, anexar_excel_dre }).
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS passos JSONB;
UPDATE workflows SET passos = jsonb_build_array(jsonb_build_object('gatilho', gatilho, 'acao', acao)) WHERE passos IS NULL;
ALTER TABLE workflows ALTER COLUMN passos SET NOT NULL;
DROP INDEX IF EXISTS workflows_empresa_gatilho;
ALTER TABLE workflows DROP COLUMN IF EXISTS gatilho, DROP COLUMN IF EXISTS acao;
CREATE INDEX IF NOT EXISTS workflows_empresa_ativo ON workflows (empresa_id) WHERE ativo;

-- Qual tópico do workflow rodou (índice em passos, começando em 0).
ALTER TABLE workflow_execucoes ADD COLUMN IF NOT EXISTS passo INTEGER;
UPDATE workflow_execucoes SET passo = 0 WHERE passo IS NULL;

COMMIT;
