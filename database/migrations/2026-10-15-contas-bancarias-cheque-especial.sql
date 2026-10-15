-- Valor de Cheque Especial (limite da conta) — informado na edição da conta bancária
-- (Cadastros > Contas Bancárias > conta). NULL = não informado.
ALTER TABLE contas_bancarias_sienge ADD COLUMN IF NOT EXISTS valor_cheque_especial NUMERIC(15,2);
