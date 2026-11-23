-- Operações › DRE Gerencial › Centros Custos: AGRUPADORES (pedido de 23/11/2026).
-- Um agrupador junta centros de custo numa obra só (ex.: EASY = EASY 1 + EASY 2): a DRE, a POC, a Projeção,
-- o dashboard e o MCP passam a ser montados pelo agrupador (backend/src/modules/dre-agrupadores).
--   - "Realiza DRE" é do agrupador: todo centro dentro dele fica com o mesmo valor (gravado também no centro,
--     pra as abas que listam centros por centros_custo_sienge.realiza_dre continuarem certas).
--   - O centro PRINCIPAL dá o id do agrupador no motor (colunas, filtros, Projeção, Projetado das versões) e é
--     o dono do orçamento da Projeção do agrupador.
-- As duas tabelas entram na cópia da configuração de cada versão da DRE (dre-versoes/tabelas.js) e voltam ao
-- que estavam quando a versão aberta é excluída. As versões salvas antes desta migration ganham as tabelas
-- vazias (eram versões sem agrupador).

CREATE TABLE IF NOT EXISTS dre_agrupadores (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome          VARCHAR(120) NOT NULL,
  realiza_dre   BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dre_agrupadores_empresa ON dre_agrupadores (empresa_id);

CREATE TABLE IF NOT EXISTS dre_agrupadores_centros (
  empresa_id   INTEGER NOT NULL,
  centro_id    INTEGER NOT NULL,
  agrupador_id INTEGER NOT NULL REFERENCES dre_agrupadores(id) ON DELETE CASCADE,
  principal    BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (empresa_id, centro_id),
  FOREIGN KEY (centro_id, empresa_id) REFERENCES centros_custo_sienge(sienge_id, empresa_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dre_agrupadores_centros_agrupador ON dre_agrupadores_centros (agrupador_id);

-- Versões já salvas: tabelas vazias e só leitura na cópia da configuração (dre_vc_<id>).
DO $$
DECLARE s TEXT;
BEGIN
  FOR s IN SELECT nspname FROM pg_namespace WHERE nspname ~ '^dre_vc_[0-9]+$' LOOP
    IF to_regclass(format('%I.dre_agrupadores', s)) IS NULL THEN
      EXECUTE format('CREATE TABLE %I.dre_agrupadores (LIKE public.dre_agrupadores INCLUDING ALL)', s);
      EXECUTE format('CREATE TRIGGER somente_leitura BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I.dre_agrupadores
                      FOR EACH STATEMENT EXECUTE FUNCTION public.dre_versao_somente_leitura()', s);
    END IF;
    IF to_regclass(format('%I.dre_agrupadores_centros', s)) IS NULL THEN
      EXECUTE format('CREATE TABLE %I.dre_agrupadores_centros (LIKE public.dre_agrupadores_centros INCLUDING ALL)', s);
      EXECUTE format('CREATE TRIGGER somente_leitura BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I.dre_agrupadores_centros
                      FOR EACH STATEMENT EXECUTE FUNCTION public.dre_versao_somente_leitura()', s);
    END IF;
  END LOOP;
END $$;
