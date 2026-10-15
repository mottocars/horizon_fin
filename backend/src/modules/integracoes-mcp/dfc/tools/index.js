const guia = require('./guia');
const fluxo = require('./fluxo');
const detalhar = require('./detalhar');
const lancamentos = require('./lancamentos');
const saldos = require('./saldos');
const cef = require('./cef');
const orcamento = require('./orcamento');
const cadastros = require('./cadastros');
const sql = require('./sql');
const informado = require('./informado');

// Ferramentas do MCP do DFC Construtoras — fechadas sobre a empresa do conector (o Claude nunca
// escolhe a empresa). TOOLS: só leitura. TOOLS_ESCRITA: só no conector "DFC CONSTRUTORAS (ALTERA
// ORÇAMENTO)" — inserem/atualizam valores HORIZON - INFORMADO e salvam versão só com eles.
const TOOLS = [guia, fluxo, detalhar, lancamentos, saldos, cef, orcamento, cadastros, sql.descrever, sql.consultar];
const TOOLS_ESCRITA = [
  { tool: informado.contas, annotations: { readOnlyHint: true } },
  { tool: informado.gravar, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true } },
  { tool: informado.replicar, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true } },
  { tool: informado.salvarVersao, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } },
];

function registrarToolsDfc(server, empresaId, { escrita = false, usuarioId = null } = {}) {
  const ctx = { usuarioId };
  const lista = [...TOOLS.map((tool) => ({ tool, annotations: { readOnlyHint: true } })), ...(escrita ? TOOLS_ESCRITA : [])];
  for (const { tool, annotations } of lista) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema, annotations }, tool.handler(empresaId, ctx));
  }
}

module.exports = { registrarToolsDfc, TOOLS, TOOLS_ESCRITA };
