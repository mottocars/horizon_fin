-- Primeiro acesso com verificação do celular (pedido do usuário): ao informar o celular e clicar em
-- "Enviar código", o sistema manda um código de 6 dígitos por WhatsApp a partir da conexão Z-API
-- "Comunicação Oficial" da HORIZON (a administradora master do sistema) — e o primeiro acesso só
-- conclui com o código certo.
-- - usuarios_codigos_verificacao: o código pendente de cada usuário (um por vez — pedir de novo
--   substitui o anterior), só o hash, com o celular para o qual foi enviado, validade e tentativas.
-- - A conexão "Comunicação Oficial" da HORIZON nasce como cópia da "Comunicação" da GENESIS (mesma
--   instância e tokens; os tokens são copiados já criptografados — a chave vem do JWT_SECRET, que é
--   o mesmo no banco local e na VPS). Não faz nada se a HORIZON já tiver a conexão.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-27-primeiro-acesso-codigo-whatsapp.sql

CREATE TABLE IF NOT EXISTS usuarios_codigos_verificacao (
    usuario_id    INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    telefone      VARCHAR(20) NOT NULL,  -- só dígitos, com DDI 55 (formato da Z-API)
    codigo_hash   VARCHAR(255) NOT NULL,
    tentativas    INTEGER NOT NULL DEFAULT 0,
    enviado_em    TIMESTAMP NOT NULL DEFAULT NOW(),
    expira_em     TIMESTAMP NOT NULL
);

INSERT INTO integracoes_zapi (empresa_id, nome_conexao, instance_id, instance_token_enc, client_token_enc, ativo)
SELECT horizon.id, 'Comunicação Oficial', z.instance_id, z.instance_token_enc, z.client_token_enc, z.ativo
FROM integracoes_zapi z
JOIN empresas genesis ON genesis.id = z.empresa_id AND genesis.cnpj = '12164139000150'
CROSS JOIN empresas horizon
WHERE horizon.cnpj = '62009822000190'
  AND z.nome_conexao = 'Comunicação'
  AND NOT EXISTS (
    SELECT 1 FROM integracoes_zapi h
    WHERE h.empresa_id = horizon.id AND h.nome_conexao = 'Comunicação Oficial'
  )
ORDER BY z.id
LIMIT 1;
