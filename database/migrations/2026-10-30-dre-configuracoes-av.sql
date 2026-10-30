-- Operações > DRE Gerencial > aba Configurações: parâmetro AVALIAÇÃO VERTICAL (por empresa).
--
-- dre_configuracoes.av_mascara_id — a linha de nível 1 da DRE (aba Máscaras; pode ser uma totalizadora,
--   como a Receita Líquida, ou um grupo, como a Receita Bruta) que vale 100% na coluna AV % da aba DRE:
--   cada linha dali pra baixo é mostrada como percentual dela, no consolidado e em cada centro. Guardada
--   pelo id: o nome da máscara pode mudar. Null = não configurado (a coluna AV % fica com traço).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-30-dre-configuracoes-av.sql

BEGIN;

ALTER TABLE dre_configuracoes
    ADD COLUMN IF NOT EXISTS av_mascara_id INTEGER REFERENCES dre_mascaras(id) ON DELETE SET NULL;

COMMIT;
