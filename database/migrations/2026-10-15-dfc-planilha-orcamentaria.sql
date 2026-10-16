-- DFC Construtoras › Orçamentos: "Planilha Orçamentária" (pedido do usuário). O botão "Layout do
-- orçamento" baixa um Excel travado com todos os centros × naturezas HORIZON - INFORMADO × meses e os
-- valores da última versão; na "Nova versão", a base "Planilha Orçamentária" importa esse Excel e grava
-- os valores como HORIZON - INFORMADO (como se tivessem sido digitados), para entrarem na versão nova.
-- Ver backend/src/modules/dfc-planilha-orcamentaria.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-15-dfc-planilha-orcamentaria.sql

-- De onde veio cada valor informado (aparece no log da versão): TELA (digitado na aba Orçamentos),
-- MCP (Claude, conector ALTERA ORÇAMENTO) ou PLANILHA (Planilha Orçamentária). Substitui via_mcp.
ALTER TABLE dfc_orcamento_informado ADD COLUMN IF NOT EXISTS via VARCHAR(10) NOT NULL DEFAULT 'TELA';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dfc_orcamento_informado' AND column_name = 'via_mcp') THEN
    UPDATE dfc_orcamento_informado SET via = 'MCP' WHERE via_mcp;
    ALTER TABLE dfc_orcamento_informado DROP COLUMN via_mcp;
  END IF;
END $$;
ALTER TABLE dfc_orcamento_informado DROP CONSTRAINT IF EXISTS dfc_orcamento_informado_via_check;
ALTER TABLE dfc_orcamento_informado ADD CONSTRAINT dfc_orcamento_informado_via_check CHECK (via IN ('TELA', 'MCP', 'PLANILHA'));

-- Importações da Planilha Orçamentária (situação da base na janela Nova versão).
CREATE TABLE IF NOT EXISTS dfc_orcamento_importacoes (
    id           SERIAL PRIMARY KEY,
    empresa_id   INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    arquivo      VARCHAR(255),
    linhas       INTEGER NOT NULL,
    incluidos    INTEGER NOT NULL,
    alterados    INTEGER NOT NULL,
    limpos       INTEGER NOT NULL,
    criado_em    TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dfc_orcamento_importacoes_empresa ON dfc_orcamento_importacoes (empresa_id, criado_em DESC);
