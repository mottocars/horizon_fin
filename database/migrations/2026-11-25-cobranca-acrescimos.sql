-- Gestão de Cobranças: acréscimos (multa + juros por atraso) das parcelas VENCIDAS em aberto, calculados pelo
-- Sienge (pedido de 25/11/2026). A base do contas a receber (bulk-data income) só traz o saldo corrigido; o
-- acréscimo do dia vem do "Saldo Devedor Presente" (GET public/api/v1/current-debit-balance?cpf=|cnpj=,
-- dueInstallments[].additionalValue), consultado cliente a cliente pela rotina do Monitor
-- "Acréscimos das parcelas vencidas (Sienge)" (backend/src/modules/cobranca-acrescimos).
-- Uma linha por parcela vencida em aberto, com o valor do dia da última consulta (o acréscimo cresce todo dia).
CREATE TABLE IF NOT EXISTS cobranca_parcelas_acrescimos (
  empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  bill_id         BIGINT NOT NULL,
  installment_id  BIGINT NOT NULL,
  valor_original  NUMERIC(15, 2),
  valor_corrigido NUMERIC(15, 2) NOT NULL, -- adjustedValue do Sienge na hora da consulta
  acrescimo       NUMERIC(15, 2) NOT NULL, -- additionalValue
  total           NUMERIC(15, 2) NOT NULL, -- currentBalance (corrigido + acréscimo)
  vencimento      DATE,
  calculado_em    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (empresa_id, bill_id, installment_id)
);
