-- Operações > DRE Gerencial > aba Configurações (por empresa):
--
-- dre_configuracoes — POC de Receita: qual Máscara DRE de nível 2 é o custo da obra que, dividido
--   pelo orçamento vigente da obra (aba Orçamento), dá o percentual de obra concluída usado no
--   reconhecimento das receitas (POC Receita = custo acumulado ÷ orçamento, até 100%). Guardado pelo
--   id da máscara porque o nome pode mudar (ou ser outra máscara). Sem linha / null = não configurado.
--   A POC de Despesa é a fração ideal vendida (aba Unidades) — não é configurável.
-- dre_documentos_excluidos — tipos de documento financeiro (sigla do Sienge: PCT, BT, ADTV…) que NÃO
--   entram na DRE: somem da aba Financeiro. Só os excluídos ficam gravados, então tipo novo que chegar
--   do Sienge entra sempre considerado (à esquerda na tela).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-30-dre-configuracoes.sql

BEGIN;

CREATE TABLE IF NOT EXISTS dre_configuracoes (
    empresa_id              INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    poc_receita_mascara_id  INTEGER REFERENCES dre_mascaras(id) ON DELETE SET NULL,
    usuario_id              INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em               TIMESTAMP DEFAULT NOW(),
    atualizado_em           TIMESTAMP DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_dre_configuracoes_atualizado_em ON dre_configuracoes;
CREATE TRIGGER trg_dre_configuracoes_atualizado_em
    BEFORE UPDATE ON dre_configuracoes
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TABLE IF NOT EXISTS dre_documentos_excluidos (
    empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    documento   VARCHAR(20) NOT NULL,   -- sigla, sem espaços (TRIM do document_identification_id / document_id)
    usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em   TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, documento)
);

COMMIT;
