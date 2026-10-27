-- Alertas de atividade suspeita (pedido do usuário): chamadas à API por fora do navegador
-- (Postman, scripts, navegador automatizado, chamada manual pelo console), token forjado,
-- força bruta no login, limite de requisições estourado, varredura de rotas, acessos negados em
-- sequência, acesso do exterior e o mesmo login em muitos IPs. Cada linha é um episódio: o
-- primeiro sinal grava a linha e manda o WhatsApp (conexão Z-API "Comunicação Oficial" da
-- HORIZON) para o Bruno Motta; os sinais iguais (mesma `chave`) dentro do intervalo de silêncio
-- só somam em `ocorrencias`. Ver backend/src/modules/alertas-seguranca/.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-27-alertas-seguranca.sql
CREATE TABLE IF NOT EXISTS alertas_seguranca (
    id               SERIAL PRIMARY KEY,
    motivo           VARCHAR(40) NOT NULL,
    titulo           VARCHAR(200) NOT NULL,
    chave            VARCHAR(200) NOT NULL,
    usuario_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    username         VARCHAR(150),             -- login digitado (tentativas de login), quando não há usuário
    ip               VARCHAR(64),
    pais             VARCHAR(10),
    user_agent       TEXT,
    rota             VARCHAR(300),             -- método + caminho, sem query string nem tokens
    detalhe          TEXT,
    ocorrencias      INTEGER NOT NULL DEFAULT 1,
    whatsapp_enviado BOOLEAN NOT NULL DEFAULT FALSE,
    whatsapp_erro    TEXT,
    criado_em        TIMESTAMP NOT NULL DEFAULT NOW(),
    ultimo_em        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alertas_seguranca_chave ON alertas_seguranca (chave, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_seguranca_criado ON alertas_seguranca (criado_em);
