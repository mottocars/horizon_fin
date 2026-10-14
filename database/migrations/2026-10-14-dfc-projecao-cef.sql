-- Operações > DFC Construtoras > Orçamentos: Projeção CEF (repasses PF / financiamento PJ) de cada
-- obra, mês a mês — mesmo motor do script gera_projecao_cef.py (aba "Projecao" do Excel), portado
-- pra backend/src/modules/dfc-projecao-cef/projecaoCef.motor.js. Gerada pelo botão "Atualizar
-- Projeção CEF" (aba Orçamentos), que regrava a obra inteira. Os percentuais (% obra) são fração
-- (0 a 1). Saídas que vão pro orçamento (pela Origem Projeção das contas): novo_registro, medicao,
-- credito_pj, juros e amortizacao — gravadas positivas; o sinal de saída é aplicado no orçamento.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-dfc-projecao-cef.sql

CREATE TABLE IF NOT EXISTS dfc_projecao_cef (
    empresa_id                     INTEGER NOT NULL,
    sienge_id                      INTEGER NOT NULL,
    mes                            DATE NOT NULL CHECK (EXTRACT(DAY FROM mes) = 1),
    pct_obra_executada             NUMERIC(12,8) NOT NULL,   -- D
    delta_pct_obra_mes             NUMERIC(12,8) NOT NULL,   -- F
    qtd_assinatura                 INTEGER NOT NULL,         -- G
    vgf_assinatura                 NUMERIC(18,2) NOT NULL,   -- J
    qtd_registro                   INTEGER NOT NULL,         -- K
    vgf_registro                   NUMERIC(18,2) NOT NULL,   -- N
    vgf_medicao                    NUMERIC(18,2) NOT NULL,   -- O
    novo_registro                  NUMERIC(18,2) NOT NULL,   -- P
    medicao                        NUMERIC(18,2) NOT NULL,   -- Q
    demanda_atingida               BOOLEAN NOT NULL,         -- R
    credito_pj                     NUMERIC(18,2) NOT NULL,   -- S
    juros                          NUMERIC(18,2) NOT NULL,   -- U
    novo_registro_nao_amortizacao  NUMERIC(18,2) NOT NULL,   -- V
    amortizacao                    NUMERIC(18,2) NOT NULL,   -- W
    saldo_devedor_pj               NUMERIC(18,2) NOT NULL,   -- X
    mutuario_pf                    NUMERIC(18,2) NOT NULL,   -- Y
    mutuario_pj                    NUMERIC(18,2) NOT NULL,   -- Z
    primeiro_cred_pj               BOOLEAN NOT NULL,         -- AA
    valor_maximo_pj                NUMERIC(18,2) NOT NULL,   -- AB
    exposicao_garantia             NUMERIC(18,2) NOT NULL,   -- AC
    PRIMARY KEY (empresa_id, sienge_id, mes),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES centros_custo_sienge(sienge_id, empresa_id) ON DELETE CASCADE
);

-- Última execução por obra: quando, quem, com qual versão dos Parâmetros e quantas unidades do Geral.
CREATE TABLE IF NOT EXISTS dfc_projecao_cef_execucao (
    empresa_id         INTEGER NOT NULL,
    sienge_id          INTEGER NOT NULL,
    versao_parametros  INTEGER NOT NULL,
    unidades           INTEGER NOT NULL,
    meses              INTEGER NOT NULL,
    usuario_id         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_em      TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, sienge_id),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES centros_custo_sienge(sienge_id, empresa_id) ON DELETE CASCADE
);
