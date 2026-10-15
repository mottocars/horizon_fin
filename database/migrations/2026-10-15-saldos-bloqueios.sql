-- Bloqueio de saldo (Operações > Saldo Contas Bancárias > Saldos das Contas, botão direito na
-- célula > Registrar bloqueio): valor bloqueado da conta no dia. A grade mostra, abaixo da conta,
-- o Saldo bloqueado e o Saldo disponível (saldo do dia - bloqueado). Tabela própria (não coluna
-- em saldos_contas_bancarias) pra a busca automática VanPix/Itaú regravar o saldo sem apagar o
-- bloqueio, e pra dar pra registrar bloqueio num dia ainda sem saldo.
CREATE TABLE IF NOT EXISTS saldos_bloqueios (
    empresa_id     INTEGER NOT NULL,
    company_id     INTEGER NOT NULL,
    numero_conta   VARCHAR(20) NOT NULL,
    data           DATE NOT NULL,
    valor          NUMERIC(15,2) NOT NULL CHECK (valor > 0),
    registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    registrado_em  TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (empresa_id, company_id, numero_conta, data),
    FOREIGN KEY (numero_conta, empresa_id, company_id)
        REFERENCES contas_bancarias_sienge (numero_conta, empresa_id, company_id) ON DELETE CASCADE
);
