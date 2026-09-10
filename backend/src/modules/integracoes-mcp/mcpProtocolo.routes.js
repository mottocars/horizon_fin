// Rota pública (sem authMiddleware — mesmo precedente do GET /api/health em
// server.js) que implementa o protocolo MCP de verdade: quem chama aqui é o
// Claude (via "custom connector"), não um usuário logado no sistema, então
// a autenticação é o próprio token na URL, resolvido pra um empresa_id (ver
// mcp.service.js::resolverEmpresaPorToken).
//
// Uma instância nova de McpServer + StreamableHTTPServerTransport é criada
// A CADA request HTTP (modo stateless, sessionIdGenerator: undefined) — não
// reaproveitar entre requests. Isso segue o próprio exemplo oficial do SDK
// (simpleStatelessStreamableHttp.js) e evita uma regressão conhecida do SDK
// ao tentar reusar transport em modo stateless.
const { Router } = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const mcpService = require('./mcp.service');
const { registrarTools } = require('./tools');

const router = Router();

function erroTokenInvalido(res) {
  // Mesma mensagem genérica pra token inexistente e pra token desativado —
  // não dá pra quem chama nenhuma pista de qual dos dois casos é.
  res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Token inválido ou inativo.' },
    id: null,
  });
}

router.post('/:token', async (req, res) => {
  let server;
  let transport;
  try {
    const empresaId = await mcpService.resolverEmpresaPorToken(req.params.token);
    if (!empresaId) return erroTokenInvalido(res);

    server = new McpServer({ name: 'horizon-fin-cobranca', version: '1.0.0' });
    registrarTools(server, empresaId);

    transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('Erro no servidor MCP:', err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Erro interno do servidor.' }, id: null });
    }
  }
});

// Servidor stateless, sem stream/notificação assíncrona nem sessão pra
// encerrar — GET (stream servidor->cliente) e DELETE (fim de sessão) não se
// aplicam aqui. Mesmo comportamento do exemplo oficial stateless do SDK.
router.get('/:token', (req, res) => {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
});

router.delete('/:token', (req, res) => {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
});

module.exports = router;
