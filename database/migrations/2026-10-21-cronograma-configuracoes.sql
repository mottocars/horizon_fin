-- Operações > Cronogramas Obras > aba Configurações (pedido do usuário), por empresa:
-- - Regra de Atraso da Construção: o que conta pra dizer que a construção de uma obra está
--   atrasada — uma regra fixa (`atraso_meses`: passados tantos meses da etapa, o resto é atraso) ou
--   o planejamento de um sistema (`atraso_sistema`: por enquanto só o Prevision — passou do mês em
--   que a curva S de base chega a 100%, é atraso) — e qual etapa da máscara Etapas do Centro de
--   Custo representa a construção (`atraso_etapa_id`).
-- - Cor dos meses em atraso (`atraso_cor`, #rrggbb; NULL = a cor padrão, vermelha).
-- - Comunicação de alteração de cronograma — mesmo esquema da aba Configurações de Repasses CEF:
--   a conexão de WhatsApp (Z-API) que dispara o aviso quando o cronograma de uma obra muda e os
--   destinatários (cronograma_comunicar_usuarios).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-21-cronograma-configuracoes.sql

CREATE TABLE IF NOT EXISTS cronograma_config (
    empresa_id           INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    atraso_regra         VARCHAR(15) CHECK (atraso_regra IN ('FIXA', 'PLANEJAMENTO')),
    atraso_meses         INTEGER CHECK (atraso_meses > 0),
    atraso_sistema       VARCHAR(20) CHECK (atraso_sistema IN ('PREVISION')),
    atraso_etapa_id      INTEGER REFERENCES mascara_itens(id) ON DELETE SET NULL,
    atraso_cor           VARCHAR(7),
    zapi_integracao_id   INTEGER REFERENCES integracoes_zapi(id) ON DELETE SET NULL,
    atualizado_por       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_em        TIMESTAMP DEFAULT NOW()
);

-- Quem recebe o comunicado de alteração de cronograma de cada empresa.
CREATE TABLE IF NOT EXISTS cronograma_comunicar_usuarios (
    empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criado_em   TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, usuario_id)
);
