const guia = require('./guia');
const fluxo = require('./fluxo');
const detalhar = require('./detalhar');
const lancamentos = require('./lancamentos');
const saldos = require('./saldos');
const cef = require('./cef');
const orcamento = require('./orcamento');
const cadastros = require('./cadastros');
const sql = require('./sql');

// Ferramentas do MCP do DFC Construtoras — todas só leitura e fechadas sobre a empresa do conector
// (o Claude nunca escolhe a empresa).
const TOOLS = [guia, fluxo, detalhar, lancamentos, saldos, cef, orcamento, cadastros, sql.descrever, sql.consultar];

function registrarToolsDfc(server, empresaId) {
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema, annotations: { readOnlyHint: true } },
      tool.handler(empresaId)
    );
  }
}

module.exports = { registrarToolsDfc, TOOLS };
