-- Operações > DFC Construtoras > aba Plano Contas: em cada conta analítica (último nível) do plano
-- de contas Sienge, a Máscara DFC (sempre de nível 2 — ver dfc_mascaras) e a Origem da Projeção.
-- Tabela própria (e não colunas em planos_financeiros_sienge) pra não misturar com o que a
-- sincronização com o Sienge regrava. Linha só existe pra conta que já teve algo escolhido.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-13-dfc-plano-contas.sql

CREATE TABLE IF NOT EXISTS dfc_plano_contas (
    empresa_id       INTEGER NOT NULL,
    sienge_id        INTEGER NOT NULL,
    mascara_id       INTEGER REFERENCES dfc_mascaras(id) ON DELETE SET NULL,
    origem_projecao  VARCHAR(40) CHECK (origem_projecao IN (
                         'CEF_NOVO_REGISTRO', 'CEF_MEDICAO', 'CEF_CREDITO_PJ', 'CEF_JUROS', 'CEF_AMORTIZACAO',
                         'SIENGE_ORCAMENTO_EMPRESARIAL', 'SIENGE_AGING', 'HORIZON_ORCAMENTO_INFORMADO')),
    atualizado_em    TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, sienge_id),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES planos_financeiros_sienge(sienge_id, empresa_id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_dfc_plano_contas_atualizado_em ON dfc_plano_contas;
CREATE TRIGGER trg_dfc_plano_contas_atualizado_em
    BEFORE UPDATE ON dfc_plano_contas
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
