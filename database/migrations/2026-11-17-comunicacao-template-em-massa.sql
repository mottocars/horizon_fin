-- Gestão de Cobranças › Comunicação: template fixo de "Comunicação em massa" (1 por empresa).
-- É o texto usado quando vários títulos do MESMO cliente são cobrados juntos na Rotina (arrastar
-- na coluna do WhatsApp/E-mail/Ligação) — ver regua-cobranca-historico/cobrancaEmMassa.service.js.
-- Não é criado pela tela nem pode ser excluído, só editado (assunto e corpo). O próprio backend
-- cria o de cada empresa na primeira leitura (comunicacao.service.js::garantirTemplateEmMassa),
-- então esta migration só precisa da coluna e da trava de unicidade. Sem clusters ({}): nunca
-- aparece para ser escolhido numa etapa da Régua.
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-11-17-comunicacao-template-em-massa.sql

BEGIN;

ALTER TABLE comunicacao_templates ADD COLUMN IF NOT EXISTS em_massa BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_comunicacao_templates_em_massa
    ON comunicacao_templates (empresa_id) WHERE em_massa;

-- A view do MCP foi criada com SELECT * antes da coluna existir: recria pra ela aparecer.
CREATE OR REPLACE VIEW mcp_comunicacao_templates AS
    SELECT * FROM comunicacao_templates
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

COMMIT;
