-- Operações > DFC Construtoras > aba Parâmetros: os parâmetros fixos da DFC de cada
-- empreendimento (centro de custo do Sienge), versionados como o Motor de Risco da Gestão de
-- Cobranças — cada gravação cria uma versão nova (MAX(versao) + 1 dentro do empreendimento),
-- nunca sobrescreve. A versão vigente é sempre a de maior número.
-- "% Repasse Construtor" não é coluna: é sempre 100 − pct_amortizacao_pj (pedido do usuário),
-- calculado na tela.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-13-dfc-parametros.sql

CREATE TABLE IF NOT EXISTS dfc_parametros_versoes (
    id                              SERIAL PRIMARY KEY,
    empresa_id                      INTEGER NOT NULL,
    sienge_id                       INTEGER NOT NULL,
    versao                          INTEGER NOT NULL,
    cto                             NUMERIC(15,2) NOT NULL,
    valor_financiamento_pj          NUMERIC(15,2) NOT NULL,
    numero_unidades                 INTEGER NOT NULL,
    ticket_medio_avaliacao_pf       NUMERIC(15,2) NOT NULL,
    pct_coeficiente_garantia        NUMERIC(7,2) NOT NULL,
    pct_amortizacao_pj              NUMERIC(5,2) NOT NULL CHECK (pct_amortizacao_pj BETWEEN 0 AND 100),
    data_demanda_minima             DATE NOT NULL,
    taxa_juros_mes                  NUMERIC(8,4) NOT NULL,
    data_inicio_ciclo               DATE NOT NULL,
    data_fim_ciclo                  DATE NOT NULL,
    qtd_vendas_mes                  INTEGER NOT NULL,
    tempo_assinatura_registro_meses INTEGER NOT NULL,
    criado_por_usuario_id           INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em                       TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES centros_custo_sienge(sienge_id, empresa_id) ON DELETE CASCADE,
    UNIQUE (empresa_id, sienge_id, versao),
    CHECK (data_fim_ciclo > data_inicio_ciclo)
);
