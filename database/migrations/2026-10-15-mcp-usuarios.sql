-- MCP: usuários liberados em cada conector (pedido do usuário). Na criação/edição do conector escolhem-se
-- os colaboradores da empresa que podem usá-lo; usuários MASTER podem sempre (não entram na lista).
-- Conectores DFC (login Horizon): só entra quem está na lista. Todos: a janela "Conexões com IA" (ícone
-- ao lado da foto, no topo) mostra a cada usuário os conectores liberados para ele, com a URL.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-15-mcp-usuarios.sql

CREATE TABLE IF NOT EXISTS integracoes_mcp_usuarios (
    conector_id  INTEGER NOT NULL REFERENCES integracoes_mcp(id) ON DELETE CASCADE,
    usuario_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    PRIMARY KEY (conector_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_integracoes_mcp_usuarios_usuario ON integracoes_mcp_usuarios (usuario_id);

-- Quem já entrou num conector DFC pelo Claude continua liberado nele (usuários não MASTER).
INSERT INTO integracoes_mcp_usuarios (conector_id, usuario_id)
SELECT DISTINCT s.conector_id, s.usuario_id
  FROM mcp_oauth_sessoes s JOIN usuarios u ON u.id = s.usuario_id
 WHERE u.permissao <> 'MASTER'
ON CONFLICT DO NOTHING;
