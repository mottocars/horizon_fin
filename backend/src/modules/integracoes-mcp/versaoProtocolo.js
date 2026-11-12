const { SUPPORTED_PROTOCOL_VERSIONS, LATEST_PROTOCOL_VERSION } = require('@modelcontextprotocol/sdk/types.js');

// Versão do protocolo MCP no cabeçalho MCP-Protocol-Version. O SDK recusa com 400 ("Unsupported protocol
// version") qualquer versão que ele não conheça — e o Claude passou a mandar uma versão mais nova que a do
// SDK em pedidos depois do initialize (12/11/2026: as sessões que caíam nisso nunca voltavam a pedir a
// lista de ferramentas e ficavam sem o módulo novo OBRA 360º). Os servidores do Horizon são stateless
// (cada pedido monta o servidor de novo), então respondemos na versão mais nova que o SDK conhece — no
// initialize a negociação já faz isso — e deixamos registrado no log qual versão o cliente pediu.
// O @hono/node-server (usado pelo transporte do SDK) lê os cabeçalhos de `rawHeaders`: trocamos lá também.
function normalizarVersaoProtocolo(req) {
  const versao = req.headers['mcp-protocol-version'];
  if (!versao || SUPPORTED_PROTOCOL_VERSIONS.includes(versao)) return;
  console.warn(`[mcp] cliente pediu a versão de protocolo ${versao}; atendendo como ${LATEST_PROTOCOL_VERSION}`);
  req.headers['mcp-protocol-version'] = LATEST_PROTOCOL_VERSION;
  const raw = req.rawHeaders || [];
  for (let i = 0; i < raw.length; i += 2) {
    if (String(raw[i]).toLowerCase() === 'mcp-protocol-version') raw[i + 1] = LATEST_PROTOCOL_VERSION;
  }
}

module.exports = { normalizarVersaoProtocolo };
