-- Cor de cada etapa da máscara "Etapas do Centro de Custo" (mascara_itens, tipo
-- ETAPAS_CENTRO_CUSTO) — pedido do usuário. Essa máscara é a lista única de etapas de obra da
-- empresa: editada em Cadastros > Máscaras e na aba Etapas de Operações > Cronogramas Obras (mesmo
-- editor), usada pelo Histórico de Etapas dos centros de custo e pelo cronograma das obras
-- (2026-10-20-cronograma-centros.sql). Os outros tipos de máscara não usam a cor (fica NULL).
-- As etapas que já existem ganham a cor da paleta padrão pela posição (mesma paleta de
-- frontend/src/utils/coresPadrao.js); etapa nova nasce com a cor da paleta pela tela.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-20-mascara-itens-cor.sql

ALTER TABLE mascara_itens ADD COLUMN IF NOT EXISTS cor VARCHAR(7);

UPDATE mascara_itens
   SET cor = (ARRAY['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
                    '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#f97316'])[((sequencia - 1) % 10 + 10) % 10 + 1]
 WHERE tipo = 'ETAPAS_CENTRO_CUSTO' AND cor IS NULL;
