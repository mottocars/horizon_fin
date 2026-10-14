-- Operações > DFC Construtoras > aba Avanços Obras: avanço ACUMULADO (%) informado à mão, por obra
-- e mês — usado quando a obra não tem Prevision (com ou sem Contrato Caixa). Ver
-- backend/src/modules/dfc-avancos/dfcAvancos.service.js.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-dfc-avanco-manual.sql

CREATE TABLE IF NOT EXISTS dfc_avanco_manual (
    empresa_id     INTEGER NOT NULL,
    sienge_id      INTEGER NOT NULL,
    mes            DATE NOT NULL CHECK (EXTRACT(DAY FROM mes) = 1),
    percentual     NUMERIC(5,2) NOT NULL CHECK (percentual BETWEEN 0 AND 100),
    usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_em  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, sienge_id, mes),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES centros_custo_sienge(sienge_id, empresa_id) ON DELETE CASCADE
);
