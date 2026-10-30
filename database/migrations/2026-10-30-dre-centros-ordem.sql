-- Operações > DRE Gerencial > aba Centros Custos: ordem dos centros escolhida pelo usuário (arrastar e
-- soltar, como na aba Máscaras). É a ordem das colunas dos centros na aba DRE (e da lista da aba e dos
-- filtros de centro da DRE Gerencial).
--
-- centros_custo_sienge.dre_ordem — posição do centro (0, 1, 2…). Null = nunca ordenado: fica depois
--   dos ordenados, pelo código (sienge_id) — então centro novo que chegar do Sienge entra no fim. A
--   sincronização com o Sienge (centros.service.js, upsertItens) não toca nesta coluna.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-30-dre-centros-ordem.sql

BEGIN;

ALTER TABLE centros_custo_sienge ADD COLUMN IF NOT EXISTS dre_ordem INTEGER;

COMMIT;
