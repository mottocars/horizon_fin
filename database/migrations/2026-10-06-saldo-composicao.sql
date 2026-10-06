-- Saldo Contas Bancárias: composição do saldo automático (mostrada na dica da célula). Gravada
-- pela abertura do período (vanpix-sync.service.js); NULL nos digitados à mão e nos antigos.
-- Ex.: { "extrato": { "fonte": "VANPIX", "apelido": "ABPFJC", "dataFechamento": "2026-10-02", "valor": 10731.61 },
--        "cobranca": { "apelido": "C3U1Y8", "de": "2026-10-03", "ate": "2026-10-05", "valor": 5559.80, "titulos": [...] } }
ALTER TABLE saldos_contas_bancarias ADD COLUMN IF NOT EXISTS composicao JSONB;
