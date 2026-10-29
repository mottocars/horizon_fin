-- Classificação da conta bancária pelo ID (pedido do usuário: renomear GARANTIDA -> GARANTIA na aba
-- Classificação deixou as contas com o nome antigo, fora da classificação). Antes a conta guardava o
-- NOME (contas_bancarias_sienge.classificacao, texto); agora guarda classificacao_id e o nome vem
-- sempre do cadastro — renomear vale na hora em todo lugar. Remover uma classificação com contas
-- passa a ser recusado (RESTRICT): troque a classificação das contas antes.
-- Também as responsáveis das Rotinas divididas por classificação passam a ser gravadas pelo id
-- (saldos_rotinas_responsaveis.chave = id da classificação).
-- A view mcp_dfc_contas_bancarias (SELECT * congelado) é recriada com a coluna "classificacao" (o
-- nome, pelo id) para o SQL do MCP continuar igual.
-- TRAVA: se alguma conta tiver um nome que não existe no cadastro da empresa, a migração para e
-- lista as contas — acerte o nome (ou cadastre a classificação) e rode de novo.
-- Aplicar: psql -U postgres -d horizon_fin -1 -v ON_ERROR_STOP=1 -f database/migrations/2026-10-29-contas-classificacao-id.sql

DO $$
DECLARE
  orfas TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contas_bancarias_sienge' AND column_name = 'classificacao') THEN
    SELECT string_agg(DISTINCT c.empresa_id || ':' || c.classificacao, ', ') INTO orfas
      FROM contas_bancarias_sienge c
      LEFT JOIN classificacoes_bancarias cb ON cb.empresa_id = c.empresa_id AND cb.nome = c.classificacao
     WHERE c.classificacao IS NOT NULL AND cb.id IS NULL;
    IF orfas IS NOT NULL THEN
      RAISE EXCEPTION 'Contas com classificação que não existe no cadastro (empresa:nome): %', orfas;
    END IF;
  END IF;
END $$;

ALTER TABLE contas_bancarias_sienge
    ADD COLUMN IF NOT EXISTS classificacao_id INTEGER REFERENCES classificacoes_bancarias(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contas_bancarias_sienge' AND column_name = 'classificacao') THEN
    UPDATE contas_bancarias_sienge c SET classificacao_id = cb.id
      FROM classificacoes_bancarias cb
     WHERE cb.empresa_id = c.empresa_id AND cb.nome = c.classificacao;
  END IF;
END $$;

DROP VIEW IF EXISTS mcp_dfc_contas_bancarias;
ALTER TABLE contas_bancarias_sienge DROP COLUMN IF EXISTS classificacao;
CREATE INDEX IF NOT EXISTS idx_contas_bancarias_sienge_classificacao ON contas_bancarias_sienge (classificacao_id);

CREATE VIEW mcp_dfc_contas_bancarias AS
    SELECT c.*, cb.nome AS classificacao
      FROM contas_bancarias_sienge c
      LEFT JOIN classificacoes_bancarias cb ON cb.id = c.classificacao_id
     WHERE c.empresa_id = current_setting('app.empresa_id', true)::int;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_leitor') THEN
    GRANT SELECT ON mcp_dfc_contas_bancarias TO mcp_leitor;
  END IF;
END $$;

-- Rotinas: chave da divisão por classificação = id (nomes sem classificação cadastrada não valiam nada).
UPDATE saldos_rotinas_responsaveis r SET chave = cb.id::text
  FROM classificacoes_bancarias cb
 WHERE r.tipo = 'CLASSIFICACAO' AND cb.empresa_id = r.empresa_id AND cb.nome = r.chave;
DELETE FROM saldos_rotinas_responsaveis WHERE tipo = 'CLASSIFICACAO' AND chave !~ '^[0-9]+$';
