-- Operações > Cronogramas Obras > aba Configurações (pedido do usuário), por empresa:
-- - Regra de Atraso de Obra: o que conta pra dizer que uma obra está atrasada — uma regra fixa
--   (`atraso_meses`: com quantos meses de obra ela passa a contar como atrasada) ou o planejamento
--   de um sistema (`atraso_sistema`: por enquanto só o Prevision).
-- - Comunicação de alteração de cronograma: por qual canal/conexão sai o aviso quando o cronograma
--   de uma obra muda, e quem recebe (cronograma_comunicar_usuarios). A conexão fica na coluna do
--   canal escolhido (Z-API para WhatsApp, integração de e-mail para E-mail).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-21-cronograma-configuracoes.sql

CREATE TABLE IF NOT EXISTS cronograma_config (
    empresa_id           INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    atraso_regra         VARCHAR(15) CHECK (atraso_regra IN ('FIXA', 'PLANEJAMENTO')),
    atraso_meses         INTEGER CHECK (atraso_meses > 0),
    atraso_sistema       VARCHAR(20) CHECK (atraso_sistema IN ('PREVISION')),
    comunicar_canal      VARCHAR(10) CHECK (comunicar_canal IN ('WHATSAPP', 'EMAIL')),
    zapi_integracao_id   INTEGER REFERENCES integracoes_zapi(id) ON DELETE SET NULL,
    email_integracao_id  INTEGER REFERENCES integracoes_email(id) ON DELETE SET NULL,
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
