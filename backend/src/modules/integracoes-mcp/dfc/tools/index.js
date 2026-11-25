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
const painel = require('./painel');
const dfcVersoes = require('../../../dfc-versoes/contexto');
const { carimbar } = require('../../../dfc-versoes/carimbo');

// Ferramentas do MCP do DFC Construtoras — fechadas sobre a empresa do conector (o Claude nunca
// escolhe a empresa). TOOLS: só leitura. TOOLS_ESCRITA: só no conector "DFC CONSTRUTORAS (ALTERA
// ORÇAMENTO)" — inserem/atualizam valores HORIZON - INFORMADO e salvam versão só com eles.
const TOOLS = [guia, painel, fluxo, detalhar, lancamentos, saldos, cef, orcamento, cadastros, sql.descrever, sql.consultar];
const TOOLS_ESCRITA = [
  { tool: informado.contas, annotations: { readOnlyHint: true } },
  { tool: informado.gravar, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true } },
  { tool: informado.replicar, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true } },
  { tool: informado.salvarVersao, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } },
];

// Versões da DFC (dfc-versoes, 25/11/2026): as ferramentas de leitura respondem pela versão PUBLICADA (a última
// aprovada — o mesmo que o dashboard Fluxo de Caixa). As de escrita só funcionam com uma versão da DFC ABERTA e
// gravam nela (com o carimbo "pelo Claude" na aba Versões); o que gravam só vai pro dashboard depois de salvar e
// aprovar a versão.
const erroMcp = (texto) => ({ isError: true, content: [{ type: 'text', text: texto }] });
function naVersao(tool, escrita, empresaId, ctx) {
  const fn = tool.handler(empresaId, ctx);
  return async (args) => {
    let versaoCtx;
    try {
      versaoCtx = await dfcVersoes.comVersao(empresaId, escrita ? 'atual' : 'publicada', () => dfcVersoes.dfcAtual());
    } catch (err) {
      return erroMcp(`Erro ao abrir a versão da DFC: ${err.message}`);
    }
    if (escrita && tool.name !== 'dfc_informado_contas' && versaoCtx.modo !== 'trabalho') {
      return erroMcp(
        `A DFC está fechada na versão ${versaoCtx.versao.numero}: nada pode ser alterado. Peça a alguém com acesso à DFC Construtoras para abrir uma versão (aba Versões › Gerar nova versão ou Editar última versão) e tente de novo.`
      );
    }
    const resultado = await dfcVersoes.comVersao(empresaId, escrita ? 'atual' : 'publicada', () => fn(args));
    if (escrita && tool.name !== 'dfc_informado_contas' && !resultado?.isError && !(args?.confirmar === false && tool.name === 'dfc_informado_salvar_versao')) {
      await carimbar(
        { dfc: { ...versaoCtx, modulo: 'orcamentos' }, user: { id: ctx.usuarioId } },
        { descricao: `Pelo Claude (MCP, ${tool.name}): ${JSON.stringify(args || {}).slice(0, 400)}` }
      );
    }
    return resultado;
  };
}

function registrarToolsDfc(server, empresaId, { escrita = false, usuarioId = null } = {}) {
  const ctx = { usuarioId };
  const lista = [
    ...TOOLS.map((tool) => ({ tool, annotations: { readOnlyHint: true }, escrita: false })),
    ...(escrita ? TOOLS_ESCRITA.map((t) => ({ ...t, escrita: true })) : []),
  ];
  for (const { tool, annotations, escrita: grava } of lista) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema, annotations }, naVersao(tool, grava, empresaId, ctx));
  }
}

module.exports = { registrarToolsDfc, TOOLS, TOOLS_ESCRITA };
