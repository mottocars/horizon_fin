-- DFC Construtoras › Contas › Configuração do saldo (botão de engrenagem, pedido do usuário, 26/11/2026):
-- de onde vem o Saldo Inicial da aba DFC.
--   ERP     = como sempre foi: o saldo real das contas com "Projeta DFC" pelo extrato do Sienge, mês a mês;
--   HORIZON = o totalizador da tela Saldo Contas Bancárias (no 1º dia do mês atual — ou o primeiro dia do mês com saldo lançado), só no mês
--             atual — soma as partes marcadas: Liberado, Limite cheque (cheque especial) e Total bloqueado.
-- Faz parte das versões da DFC (dfc-versoes/tabelas.js — volta com a versão; gravar só com versão aberta).
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-11-26-dfc-saldo-config.sql

BEGIN;

CREATE TABLE IF NOT EXISTS dfc_saldo_config (
    empresa_id     INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    tipo_saldo     VARCHAR(10) NOT NULL DEFAULT 'ERP' CHECK (tipo_saldo IN ('ERP', 'HORIZON')),
    soma_liberado  BOOLEAN NOT NULL DEFAULT TRUE,
    soma_cheque    BOOLEAN NOT NULL DEFAULT TRUE,
    soma_bloqueado BOOLEAN NOT NULL DEFAULT FALSE,
    atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_em  TIMESTAMP DEFAULT NOW()
);

COMMIT;
