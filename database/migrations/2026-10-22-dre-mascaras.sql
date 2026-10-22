-- Operações > DRE Gerencial > aba Máscaras: a estrutura da DRE de cada empresa passa a ser
-- cadastrada em 2 níveis pelo usuário — igual à DFC (ver 2026-10-13-dfc-mascaras.sql), mesma
-- tabela-espelho. Antes o nível 1 era fixo no código (frontend/src/config/estruturaDre.js) e só
-- o nível 2 era cadastrado, em mascara_itens (tipo 'DRE', `grupo` = código do nível 1).
--
-- A migração leva os itens de mascara_itens tipo 'DRE' pra cá (cada grupo fixo vira um nível 1,
-- na ordem da estrutura antiga) e repassa planos_financeiros_sienge.classificacao_dre_id — que
-- apontava pra mascara_itens — pros ids novos. Os itens antigos em mascara_itens ficam lá
-- (ninguém mais lê), pra não apagar nada. Só faz a cópia/repasse enquanto a FK ainda aponta pra
-- mascara_itens: rodar de novo não duplica nem mexe nas classificações.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-22-dre-mascaras.sql

BEGIN;

CREATE TABLE IF NOT EXISTS dre_mascaras (
    id            SERIAL PRIMARY KEY,
    empresa_id    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    parent_id     INTEGER REFERENCES dre_mascaras(id) ON DELETE CASCADE,
    ordem         INTEGER NOT NULL,
    descricao     VARCHAR(150) NOT NULL,
    criado_em     TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW(),
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_dre_mascaras_empresa ON dre_mascaras (empresa_id, parent_id, ordem);

DROP TRIGGER IF EXISTS trg_dre_mascaras_atualizado_em ON dre_mascaras;
CREATE TRIGGER trg_dre_mascaras_atualizado_em
    BEFORE UPDATE ON dre_mascaras
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

DO $$
DECLARE
    grupos TEXT[] := ARRAY['RECEITA_BRUTA', 'IMPOSTOS_RECEITA', 'CIV', 'DESPESAS_OPERACIONAIS', 'DESPESAS_RECEITAS_NAO_OPERACIONAIS'];
    nomes  TEXT[] := ARRAY['RECEITA BRUTA', 'IMPOSTOS SOBRE A RECEITA', 'CIV - CUSTO DOS IMÓVEIS VENDIDOS', 'DESPESAS OPERACIONAIS', 'DESPESAS/RECEITAS NÃO OPERACIONAIS'];
    emp    INTEGER;
    pai    INTEGER;
    novo   INTEGER;
    item   RECORD;
    n      INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'planos_financeiros_sienge_classificacao_dre_id_fkey'
           AND confrelid = 'mascara_itens'::regclass
    ) THEN
        RAISE NOTICE 'classificacao_dre_id já aponta pra dre_mascaras — nada a migrar.';
        RETURN;
    END IF;

    -- De-para dos ids antigos (mascara_itens) pros novos (dre_mascaras).
    CREATE TEMP TABLE dre_mascaras_de_para (antigo_id INTEGER PRIMARY KEY, novo_id INTEGER NOT NULL) ON COMMIT DROP;

    FOR emp IN
        SELECT DISTINCT empresa_id FROM mascara_itens WHERE tipo = 'DRE' ORDER BY empresa_id
    LOOP
        FOR g IN 1 .. array_length(grupos, 1) LOOP
            INSERT INTO dre_mascaras (empresa_id, parent_id, ordem, descricao)
            VALUES (emp, NULL, g, nomes[g])
            RETURNING id INTO pai;

            n := 0;
            FOR item IN
                SELECT id, descricao FROM mascara_itens
                 WHERE tipo = 'DRE' AND empresa_id = emp AND grupo = grupos[g]
                 ORDER BY sequencia, id
            LOOP
                n := n + 1;
                INSERT INTO dre_mascaras (empresa_id, parent_id, ordem, descricao)
                VALUES (emp, pai, n, COALESCE(NULLIF(LEFT(TRIM(item.descricao), 150), ''), '(sem nome)'))
                RETURNING id INTO novo;
                INSERT INTO dre_mascaras_de_para (antigo_id, novo_id) VALUES (item.id, novo);
            END LOOP;
        END LOOP;
    END LOOP;

    ALTER TABLE planos_financeiros_sienge DROP CONSTRAINT planos_financeiros_sienge_classificacao_dre_id_fkey;

    -- Classificação que não estiver no de-para (não era um item DRE) fica sem.
    UPDATE planos_financeiros_sienge p
       SET classificacao_dre_id = dp.novo_id
      FROM planos_financeiros_sienge p2
      LEFT JOIN dre_mascaras_de_para dp ON dp.antigo_id = p2.classificacao_dre_id
     WHERE p.sienge_id = p2.sienge_id AND p.empresa_id = p2.empresa_id
       AND p2.classificacao_dre_id IS NOT NULL;

    ALTER TABLE planos_financeiros_sienge
        ADD CONSTRAINT planos_financeiros_sienge_classificacao_dre_id_fkey
        FOREIGN KEY (classificacao_dre_id) REFERENCES dre_mascaras(id) ON DELETE SET NULL;
END $$;

COMMIT;
