-- DFC Construtoras > Orçamentos: valor informado à mão, por centro de custo, conta e mês, nas
-- contas com Origem Projeção "HORIZON - INFORMADO" (HORIZON_ORCAMENTO_INFORMADO) no plano usado
-- pelo centro. Sem linha = sem valor.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-dfc-orcamento-informado.sql

CREATE TABLE IF NOT EXISTS dfc_orcamento_informado (
    empresa_id     INTEGER NOT NULL,
    centro_id      INTEGER NOT NULL,
    sienge_id      INTEGER NOT NULL,
    mes            DATE NOT NULL CHECK (EXTRACT(DAY FROM mes) = 1),
    valor          NUMERIC(18,2) NOT NULL,
    usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_em  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, centro_id, sienge_id, mes),
    FOREIGN KEY (centro_id, empresa_id) REFERENCES centros_custo_sienge(sienge_id, empresa_id) ON DELETE CASCADE
);
