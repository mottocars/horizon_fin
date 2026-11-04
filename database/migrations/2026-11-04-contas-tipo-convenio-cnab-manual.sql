-- Tipo de convênio da conta bancária: de onde vem o saldo automático na abertura do período
-- (Operações > Saldo Contas Bancárias). Antes era deduzido (código cedente = VanPix; agência/
-- conta/dígito casados com uma conexão Itaú = API Itaú); agora é escolhido na edição da conta.
--   VANPIX      -> códigos cedente extrato/cobrança (apelidos das conexões VanPix)
--   ITAU        -> conexão API Itaú com a mesma agência, conta e dígito
--   CNAB_MANUAL -> arquivos de retorno CNAB 240 anexados na abertura do período: extrato
--                  eletrônico (casado por banco + conta + dígito) e cobrança SIGCB (casada pelo
--                  código do beneficiário)
--   NULL        -> sem convênio (saldo informado à mão ou herdado, conforme a classificação)
-- Ver backend/src/modules/saldo-contas-bancarias/vanpix-sync.service.js e cnab-manual.service.js.
-- Aplicar na VPS: docker exec -i horizonhub-db-1 psql -U postgres -d horizon_fin < database/migrations/2026-11-04-contas-tipo-convenio-cnab-manual.sql

ALTER TABLE contas_bancarias_sienge ADD COLUMN IF NOT EXISTS tipo_convenio VARCHAR(12)
    CHECK (tipo_convenio IN ('VANPIX', 'ITAU', 'CNAB_MANUAL'));

-- Código do beneficiário (convênio de cobrança CAIXA/SIGCB) das contas CNAB 240 manual — é
-- o que casa os títulos do arquivo de retorno de cobrança com a conta.
ALTER TABLE contas_bancarias_sienge ADD COLUMN IF NOT EXISTS codigo_beneficiario VARCHAR(20);

-- Contas que já funcionavam assim continuam iguais: quem tem código cedente vira VanPix...
UPDATE contas_bancarias_sienge
   SET tipo_convenio = 'VANPIX'
 WHERE tipo_convenio IS NULL
   AND (NULLIF(codigo_cedente_extrato, '') IS NOT NULL OR NULLIF(codigo_cedente_cobranca, '') IS NOT NULL);

-- ...e a conta Itaú casada com uma conexão API Itaú (mesmo critério de listarContasItau) vira Itaú.
UPDATE contas_bancarias_sienge s
   SET tipo_convenio = 'ITAU'
  FROM conexoes_itau c
 WHERE s.tipo_convenio IS NULL
   AND s.empresa_id = c.empresa_id
   AND LTRIM(s.agencia_enriquecida, '0') = LTRIM(c.agencia, '0')
   AND LTRIM(s.conta_enriquecida, '0') = LTRIM(c.conta, '0')
   AND s.digito = c.dac
   AND COALESCE(NULLIF(s.banco_enriquecido, ''), REGEXP_REPLACE(s.banco_numero, '[^0-9]', '', 'g')) IN ('341', '0341');

-- Saldo automático vindo de arquivo CNAB 240 anexado à mão.
ALTER TABLE saldos_contas_bancarias DROP CONSTRAINT IF EXISTS saldos_contas_bancarias_fonte_check;
ALTER TABLE saldos_contas_bancarias ADD CONSTRAINT saldos_contas_bancarias_fonte_check
    CHECK (fonte IN ('VANPIX', 'ITAU', 'CNAB'));
