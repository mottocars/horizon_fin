-- Empresa modelo (HZN CONSTRUTORA): empresa fictícia de demonstração, com dados em todas as
-- telas. Só pode existir UMA, não pode ser excluída nem desativada e as integrações dela são
-- simuladas (nenhuma chamada externa sai em nome dela) — exceto a API Itaú, que usa as
-- conexões reais de outra empresa por meio de conexoes_itau.conexao_origem_id, com nomes,
-- contas e contrapartes trocados antes de chegar à tela.
-- Os dados são montados por backend/scripts/empresa-modelo/montar.js (só mexe na empresa modelo).
-- Aplicar na VPS: docker exec -i horizonhub-db-1 psql -U postgres -d horizon_fin -1 -v ON_ERROR_STOP=1 < database/migrations/2026-11-05-empresa-modelo.sql

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS empresa_modelo BOOLEAN NOT NULL DEFAULT FALSE;

-- No máximo uma empresa modelo.
CREATE UNIQUE INDEX IF NOT EXISTS empresas_uma_modelo ON empresas ((TRUE)) WHERE empresa_modelo;

-- Trava no banco (além da API): a empresa modelo não é excluída, não é desativada e não deixa
-- de ser modelo.
CREATE OR REPLACE FUNCTION empresas_protege_modelo() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.empresa_modelo THEN
      RAISE EXCEPTION 'A empresa modelo não pode ser excluída.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.empresa_modelo AND (NEW.empresa_modelo IS DISTINCT FROM TRUE OR NEW.ativo IS DISTINCT FROM TRUE) THEN
    RAISE EXCEPTION 'A empresa modelo não pode ser desativada nem deixar de ser modelo.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_empresas_protege_modelo ON empresas;
CREATE TRIGGER trg_empresas_protege_modelo
  BEFORE UPDATE OR DELETE ON empresas
  FOR EACH ROW EXECUTE FUNCTION empresas_protege_modelo();

-- Conexão Itaú "espelho" da empresa modelo: as credenciais, o certificado e a conta consultada
-- vêm da conexão de origem (outra empresa); a linha da empresa modelo guarda só o que aparece
-- na tela (nome, razão social, CNPJ, agência/conta fictícias). A origem nunca é alterada.
ALTER TABLE conexoes_itau ADD COLUMN IF NOT EXISTS conexao_origem_id INTEGER
  REFERENCES conexoes_itau(id) ON DELETE SET NULL;
