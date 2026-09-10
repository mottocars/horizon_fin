const rankingSemInteracao = require('./rankingSemInteracao');
const rankingInadimplencia = require('./rankingInadimplencia');
const explicarCluster = require('./explicarCluster');
const resumoCarteira = require('./resumoCarteira');
const dicionarioDados = require('./dicionarioDados');
const consultaSql = require('./consultaSql');

const TOOLS = [rankingSemInteracao, rankingInadimplencia, explicarCluster, resumoCarteira, dicionarioDados, consultaSql];

// Registra as 6 tools no McpServer desta requisição, cada uma já fechada
// sobre o `empresaId` resolvido a partir do token da URL (ver
// mcpProtocolo.routes.js) — é isso que garante que o Claude só enxerga os
// dados desta empresa, nunca precisa (nem consegue) passar empresa_id como
// parâmetro de nenhuma tool.
function registrarTools(server, empresaId) {
  for (const tool of TOOLS) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, tool.handler(empresaId));
  }
}

module.exports = { registrarTools };
