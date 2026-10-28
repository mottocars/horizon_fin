const { Router } = require('express');
const cors = require('cors');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const oauth = require('./oauth.service');
const { registrarToolsDfc } = require('./tools');
const { TOOLS_SALDOS } = require('../saldos/tools');
const { TOOLS_AGING } = require('../aging/tools');

// MCP do conector Horizon (/api/mcp/dfc/:token — o caminho "dfc" ficou dos conectores já criados). O
// token do link só diz QUAL conector (empresa, módulos e duração do login); quem libera é o login do
// Horizon (OAuth, ver oauth.routes.js): sem um Bearer válido e dentro da validade da sessão, responde
// 401 apontando os metadados de autorização — e o Claude abre a tela de login. Mesmo modo stateless de
// mcpProtocolo.routes.js. As ferramentas são as dos módulos que QUEM ENTROU pode usar (modulos.js).

const INSTRUCOES = {
  DFC:
    'DFC Construtoras (fluxo de caixa): comece por dfc_guia para entender como o fluxo é montado e qual ferramenta usar. ' +
    'Para o dashboard Econômico Financeiro › Fluxo de Caixa (indicadores, etiquetas, fôlego por SPE, simulador), use dfc_painel_fluxo_caixa. Valores em R$, meses AAAA-MM.',
  DFC_ORCAMENTO:
    'Alteração do Orçamento: só dá para inserir/atualizar valores nas contas com Origem Projeção "HORIZON - INFORMADO" (dfc_informado_contas mostra quais); as demais origens vêm das integrações e não podem ser alteradas. ' +
    'Fluxo: dfc_informado_contas -> confirmar com o usuário -> dfc_informado_gravar / dfc_informado_replicar -> prévia em dfc_informado_salvar_versao -> salvar com confirmar=true só com o aval do usuário. ' +
    'Valores em R$ com sinal (saída negativa).',
  SALDOS_CONTAS:
    'Saldo das Contas Bancárias (Operações > Saldo Contas Bancárias, só leitura): comece por saldos_guia — explica classificações, origem de cada saldo (automático VanPix/Itaú, herdado do dia anterior ou manual), bloqueios, cheque especial e como cada total é calculado. ' +
    'Totais e quem compõe cada um: saldos_resumo; cada conta no dia: saldos_contas; uma conta ao longo dos dias: saldos_historico_conta. Datas AAAA-MM-DD. ' +
    'Não confunda com dfc_saldos_bancarios (saldo de abertura do mês pelo extrato do Sienge, usado no DFC).',
  AGING:
    'Aging List (Dashboards › Econômico Financeiro › Aging List, só leitura): contas a receber e a pagar em aberto do Sienge (saldo corrigido), por faixa de vencimento, integrados ao saldo das contas bancárias. ' +
    'Comece por aging_guia (regras, faixas, filtros, filtros salvos do usuário e qual ferramenta usar). Tela: aging_painel; agrupamentos (centro, plano de contas, cliente/fornecedor, SPE…): aging_agrupar; títulos: aging_parcelas; ' +
    'caixa futuro (dia/semana/mês, cenários, por SPE): aging_projecao_caixa; inadimplência: aging_inadimplencia; recebido/pago de fato e pontualidade: aging_historico_baixas. ' +
    'Sem período = toda a carteira em aberto; a tela abre com o ano atual (periodo_da_tela=true).',
};

// Ferramentas de só leitura no formato { name, description, inputSchema, handler(empresaId, ctx) }.
function registrarLeitura(server, empresaId, tools, ctx) {
  for (const tool of tools) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema, annotations: { readOnlyHint: true } }, tool.handler(empresaId, ctx));
  }
}

function registrarTools(server, empresaId, modulos, ctx) {
  if (modulos.includes('DFC')) registrarToolsDfc(server, empresaId, { escrita: modulos.includes('DFC_ORCAMENTO'), usuarioId: ctx.usuarioId });
  if (modulos.includes('SALDOS_CONTAS')) registrarLeitura(server, empresaId, TOOLS_SALDOS, ctx);
  if (modulos.includes('AGING')) registrarLeitura(server, empresaId, TOOLS_AGING, ctx);
}

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

    const { modulos } = acesso.usuario;
    server = new McpServer(
      { name: 'horizon-fin', version: '2.0.0' },
      {
        instructions:
          `Servidor do Horizon Fin da empresa ${conector.empresa}. ` +
          (modulos.includes('DFC_ORCAMENTO') ? '' : 'Só leitura. ') +
          modulos.map((m) => INSTRUCOES[m]).join(' '),
      }
    );
    registrarTools(server, conector.empresa_id, modulos, { usuarioId: acesso.usuario.id });
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
