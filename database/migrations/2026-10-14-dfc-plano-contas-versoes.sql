-- DFC Construtoras > Plano Contas: versão do plano de contas por centro de custo. O plano "Global"
-- continua em dfc_plano_contas e vale pra todos os centros; um centro com versão própria (criada
-- copiando o Global e editada à parte) usa a dele no Orçamento e na Projeção CEF.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-dfc-plano-contas-versoes.sql

-- Quais centros têm versão própria.
CREATE TABLE IF NOT EXISTS dfc_plano_contas_versoes (
    empresa_id   INTEGER NOT NULL,
    centro_id    INTEGER NOT NULL,
    usuario_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em    TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, centro_id),
    FOREIGN KEY (centro_id, empresa_id) REFERENCES centros_custo_sienge(sienge_id, empresa_id) ON DELETE CASCADE
);

-- Máscara DFC / Origem Projeção de cada conta, na versão do centro (mesmos campos de dfc_plano_contas).
CREATE TABLE IF NOT EXISTS dfc_plano_contas_centro (
    empresa_id       INTEGER NOT NULL,
    centro_id        INTEGER NOT NULL,
    sienge_id        INTEGER NOT NULL,
    mascara_id       INTEGER REFERENCES dfc_mascaras(id) ON DELETE SET NULL,
    origem_projecao  VARCHAR(40) CHECK (origem_projecao IN (
                         'CEF_NOVO_REGISTRO', 'CEF_MEDICAO', 'CEF_CREDITO_PJ', 'CEF_JUROS', 'CEF_AMORTIZACAO',
                         'SIENGE_ORCAMENTO_EMPRESARIAL', 'SIENGE_AGING', 'HORIZON_ORCAMENTO_INFORMADO')),
    atualizado_em    TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, centro_id, sienge_id),
    FOREIGN KEY (empresa_id, centro_id) REFERENCES dfc_plano_contas_versoes(empresa_id, centro_id) ON DELETE CASCADE,
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES planos_financeiros_sienge(sienge_id, empresa_id) ON DELETE CASCADE
);

-- Cada origem CEF_* só em uma conta, dentro de cada versão.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dfc_plano_contas_centro_origem_cef
    ON dfc_plano_contas_centro (empresa_id, centro_id, origem_projecao)
    WHERE origem_projecao LIKE 'CEF\_%';

DROP TRIGGER IF EXISTS trg_dfc_plano_contas_centro_atualizado_em ON dfc_plano_contas_centro;
CREATE TRIGGER trg_dfc_plano_contas_centro_atualizado_em
    BEFORE UPDATE ON dfc_plano_contas_centro
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
