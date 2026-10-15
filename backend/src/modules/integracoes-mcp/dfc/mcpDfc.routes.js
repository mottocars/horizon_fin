const { Router } = require('express');
const cors = require('cors');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const oauth = require('./oauth.service');
const { registrarToolsDfc } = require('./tools');

// MCP do DFC Construtoras (/api/mcp/dfc/:token). O token do link só diz QUAL conector (empresa e
// duração do login); quem libera é o login do Horizon (OAuth, ver oauth.routes.js): sem um Bearer
// válido e dentro da validade da sessão, responde 401 apontando os metadados de autorização — e o
// Claude abre a tela de login. Mesmo modo stateless de mcpProtocolo.routes.js.

const router = Router();
router.use(cors({ origin: '*', exposedHeaders: ['WWW-Authenticate', 'Mcp-Session-Id'] }));

// O cabeçalho WWW-Authenticate vai em ASCII (sem acento); a mensagem em português fica no corpo.
function naoAutorizado(res, token, descricao) {
  res
    .status(401)
    .set(
      'WWW-Authenticate',
      `Bearer resource_metadata="${oauth.urlMetadadosRecurso(token)}", error="invalid_token", error_description="Login required"`
    )
    .json({ jsonrpc: '2.0', error: { code: -32001, message: descricao }, id: null });
}

router.post('/:token', async (req, res) => {
  let server;
  let transport;
  try {
    const conector = await oauth.conectorPorToken(req.params.token);
    if (!conector) {
      return res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Conector inexistente ou inativo.' }, id: null });
    }
    const header = req.headers.authorization || '';
    const acesso = header.startsWith('Bearer ') ? await oauth.validarAcesso(header.slice(7), conector) : null;
    if (!acesso) return naoAutorizado(res, req.params.token, 'Faça login no Horizon Fin para usar este conector.');

    const escrita = conector.escopo === 'DFC_ORCAMENTO';
    server = new McpServer(
      { name: 'horizon-fin-dfc-construtoras', version: '1.0.0' },
      {
        instructions: escrita
          ? 'Servidor do DFC Construtoras (fluxo de caixa) do Horizon Fin, com alteração do Orçamento. Comece por dfc_guia para entender como o fluxo é montado. ' +
            'Só dá para inserir/atualizar valores nas contas com Origem Projeção "HORIZON - INFORMADO" (dfc_informado_contas mostra quais); as demais origens vêm das integrações e não podem ser alteradas. ' +
            'Fluxo: dfc_informado_contas -> confirmar com o usuário -> dfc_informado_gravar / dfc_informado_replicar -> prévia em dfc_informado_salvar_versao -> salvar com confirmar=true só com o aval do usuário. ' +
            'Valores em R$ com sinal (saída negativa), meses AAAA-MM.'
          : 'Servidor do DFC Construtoras (fluxo de caixa) do Horizon Fin, só leitura. Comece por dfc_guia para entender como o fluxo é montado e qual ferramenta usar. Valores em R$, meses AAAA-MM.',
      }
    );
    registrarToolsDfc(server, conector.empresa_id, { escrita, usuarioId: acesso.usuario.id });
    transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('Erro no servidor MCP do DFC:', err);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Erro interno do servidor.' }, id: null });
  }
});

// Stateless: sem stream servidor->cliente nem fim de sessão. O GET sem login também responde 401 (alguns
// clientes descobrem a autorização por ele).
router.get('/:token', async (req, res) => {
  const conector = await oauth.conectorPorToken(req.params.token).catch(() => null);
  const header = req.headers.authorization || '';
  if (conector && !(header.startsWith('Bearer ') && (await oauth.validarAcesso(header.slice(7), conector).catch(() => null)))) {
    return naoAutorizado(res, req.params.token, 'Faça login no Horizon Fin para usar este conector.');
  }
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
});
router.delete('/:token', (req, res) => res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }));

module.exports = router;
