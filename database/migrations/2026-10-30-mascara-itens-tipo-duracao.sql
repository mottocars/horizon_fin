-- "Tipo duração" de cada etapa da máscara "Etapas do Centro de Custo" (mascara_itens, tipo
-- ETAPAS_CENTRO_CUSTO) — pedido do usuário: MESES ou ANOS. A duração da etapa no Histórico de
-- Etapas do centro de custo (= cronograma das obras) é digitada e mostrada nessa unidade; o Gantt e
-- o Excel do cronograma também. Os outros tipos de máscara não usam (fica NULL).
-- As etapas que já existem ficam como funcionavam: MESES, e ANOS só na última de cada empresa
-- (antes a última etapa era sempre em anos). Etapa nova nasce em MESES.
-- Aplicar: psql -U postgres -d horizon_fin -1 -v ON_ERROR_STOP=1 -f database/migrations/2026-10-30-mascara-itens-tipo-duracao.sql

ALTER TABLE mascara_itens ADD COLUMN IF NOT EXISTS tipo_duracao VARCHAR(5)
    CHECK (tipo_duracao IN ('MESES', 'ANOS'));

UPDATE mascara_itens m
   SET tipo_duracao = CASE WHEN m.sequencia = u.ultima THEN 'ANOS' ELSE 'MESES' END
  FROM (SELECT empresa_id, MAX(sequencia) AS ultima FROM mascara_itens
         WHERE tipo = 'ETAPAS_CENTRO_CUSTO' AND grupo = '' GROUP BY empresa_id) u
 WHERE m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.grupo = '' AND m.empresa_id = u.empresa_id
   AND m.tipo_duracao IS NULL;
