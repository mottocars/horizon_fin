-- Operações > Cronogramas Obras > aba Centros de Custos: o cronograma de cada obra — a data de
-- início de cada etapa (máscara "Etapas do Centro de Custo" — mascara_itens, tipo
-- ETAPAS_CENTRO_CUSTO; ver 2026-10-20-mascara-itens-cor.sql) e o término da última. Só as datas são gravadas: a
-- quantidade entre uma etapa e a seguinte (meses; na última, anos até o término) é sempre calculada
-- pela tela a partir delas, então reordenar ou criar etapas nunca deixa uma quantidade "velha".
-- Linha só existe com data (apagar a data apaga a linha). Ligadas ao centro de custo como os
-- Parâmetros da DFC (a sincronização com o Sienge faz upsert, não apaga os centros).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-20-cronograma-centros.sql

CREATE TABLE IF NOT EXISTS cronograma_centro_etapas (
    empresa_id    INTEGER NOT NULL,
    sienge_id     INTEGER NOT NULL,     -- o centro de custo
    etapa_id      INTEGER NOT NULL REFERENCES mascara_itens(id) ON DELETE CASCADE,  -- item ETAPAS_CENTRO_CUSTO
    data          DATE NOT NULL,        -- início da etapa nesta obra
    usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (empresa_id, sienge_id, etapa_id),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES centros_custo_sienge (sienge_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cronograma_centro_etapas_etapa ON cronograma_centro_etapas (etapa_id);

-- Término do cronograma de cada obra (fim da última etapa = data dela + os anos informados).
CREATE TABLE IF NOT EXISTS cronograma_centros (
    empresa_id    INTEGER NOT NULL,
    sienge_id     INTEGER NOT NULL,
    data_termino  DATE NOT NULL,
    usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (empresa_id, sienge_id),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES centros_custo_sienge (sienge_id, empresa_id) ON DELETE CASCADE
);
