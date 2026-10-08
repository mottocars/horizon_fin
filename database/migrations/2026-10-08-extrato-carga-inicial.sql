-- Saldo Contas Bancárias: carga inicial da VanPix Extrato por conta. Na primeira abertura de
-- período a conta é buscada até 1 ano para trás; depois, só 10 dias (e repete o último saldo
-- se não aparecer). Guarda o apelido com que a carga foi feita: trocar o "Código cedente
-- extrato bancário" da conta faz a carga inicial de novo. Ver vanpix-sync.service.js.
ALTER TABLE contas_bancarias_sienge ADD COLUMN IF NOT EXISTS extrato_carga_inicial_apelido VARCHAR(50);
ALTER TABLE contas_bancarias_sienge ADD COLUMN IF NOT EXISTS extrato_carga_inicial_em TIMESTAMP;
