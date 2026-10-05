-- Conexão VanPix: finalidade — Extrato Bancário (retornos usados no saldo das contas) ou
-- Cobrança. As conexões que já existiam são todas de extrato (DEFAULT preenche).
ALTER TABLE integracoes_vanpix
    ADD COLUMN IF NOT EXISTS finalidade VARCHAR(20) NOT NULL DEFAULT 'EXTRATO'
    CHECK (finalidade IN ('EXTRATO', 'COBRANCA'));
