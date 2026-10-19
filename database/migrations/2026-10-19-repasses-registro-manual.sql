-- DFC Construtoras > Repasses: mês do registro informado à mão, cliente a cliente (pedido do usuário).
-- Cliente sem data de registro no Geral é projetado para assinatura + "Tempo Entre Assinatura e Registro"
-- (Parâmetros da obra); quando o parâmetro não acerta, o responsável informa o mês aqui e a Projeção CEF
-- passa a usar esse mês. Fica fora de extrato_unidades (a importação do Geral apaga e regrava as
-- unidades), ligado pelo contrato do empreendimento + contrato da unidade: uma nova importação nunca
-- desfaz o mês manual. Quando o Geral trouxer a data de registro de verdade, ela prevalece.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-19-repasses-registro-manual.sql

CREATE TABLE IF NOT EXISTS dfc_repasses_registro_manual (
    empresa_id               INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    contrato_empreendimento  VARCHAR(20) NOT NULL,
    numero_contrato_unidade  VARCHAR(20) NOT NULL,
    mes                      DATE NOT NULL, -- 1º dia do mês do registro
    usuario_id               INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_em            TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (empresa_id, contrato_empreendimento, numero_contrato_unidade)
);
