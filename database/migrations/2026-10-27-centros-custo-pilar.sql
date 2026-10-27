-- Cadastros > Centros de Custo: "Unidade de Negócio" passa a se chamar "Pilar" — na coluna do centro,
-- na FK, na view do MCP do DFC (que expõe as colunas do centro) e no tipo da máscara em Cadastros >
-- Máscaras (UNIDADES_NEGOCIO -> PILARES). Os itens e os vínculos dos centros continuam os mesmos.
-- Muda coluna usada pelo backend: fazer o build antes, aplicar e subir o backend novo logo em seguida.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-27-centros-custo-pilar.sql

BEGIN;

ALTER TABLE centros_custo_sienge RENAME COLUMN unidade_negocio_id TO pilar_id;
ALTER TABLE centros_custo_sienge
    RENAME CONSTRAINT centros_custo_sienge_unidade_negocio_id_fkey TO centros_custo_sienge_pilar_id_fkey;

-- A view é SELECT *: o Postgres guarda as colunas pelo número, então ela continua funcionando, mas
-- manteria o nome antigo da coluna.
ALTER VIEW mcp_dfc_centros_custo RENAME COLUMN unidade_negocio_id TO pilar_id;

UPDATE mascara_itens SET tipo = 'PILARES' WHERE tipo = 'UNIDADES_NEGOCIO';

COMMIT;
