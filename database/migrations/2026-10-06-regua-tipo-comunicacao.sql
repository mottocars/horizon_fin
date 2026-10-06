-- Régua de Cobrança > Configurações Globais: "Comunicação automática" (liga/desliga)
-- vira "Tipo de Comunicação" com 3 opções:
--   automatica  = envio nos horários agendados (o que era `ativa = TRUE`)
--   visualizar  = responsável abre a mensagem na Rotina e clica Enviar (o que era `ativa = FALSE`)
--   copiar      = responsável copia o conteúdo e envia pelo próprio WhatsApp
-- `ativa` fica na tabela só por compatibilidade, o sistema passa a ler `tipo`.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-06-regua-tipo-comunicacao.sql
ALTER TABLE regua_cobranca_comunicacao_automatica
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'visualizar'
  CHECK (tipo IN ('automatica', 'visualizar', 'copiar'));

UPDATE regua_cobranca_comunicacao_automatica SET tipo = 'automatica' WHERE ativa = TRUE;
