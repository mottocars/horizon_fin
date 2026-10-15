const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const clientesRoutes = require('./modules/clientes/clientes.routes');
const empresasRoutes = require('./modules/empresas/empresas.routes');
const siengeRoutes = require('./modules/integracoes-sienge/sienge.routes');
const zapiRoutes = require('./modules/integracoes-zapi/zapi.routes');
const vanpixRoutes = require('./modules/integracoes-vanpix/vanpix.routes');
const itauRoutes = require('./modules/integracoes-itau/itau.routes');
const emailIntegracaoRoutes = require('./modules/integracoes-email/email.routes');
const construtorVendasRoutes = require('./modules/integracoes-construtor-vendas/construtorVendas.routes');
const actioonRoutes = require('./modules/integracoes-actioon/actioon.routes');
const bancoDadosRoutes = require('./modules/integracoes-banco-dados/bancoDados.routes');
const relatorioMasaRoutes = require('./modules/relatorio-empreendimentos-masa/relatorioMasa.routes');
const relatorioRepassesCefRoutes = require('./modules/relatorio-repasses-cef/relatorioRepassesCef.routes');
const relatorioDesempenhoCobrancaRoutes = require('./modules/relatorio-desempenho-cobranca/desempenhoCobranca.routes');
const relatorioNotasPendentesRoutes = require('./modules/relatorio-notas-pendentes/notasPendentes.routes');
const relatorioExtratosRoutes = require('./modules/relatorio-extratos-bancarios/extratos.routes');
const projetosRoutes = require('./modules/projetos/projetos.routes');
const previsionRoutes = require('./modules/integracoes-prevision/prevision.routes');
const previsionDashboardsRoutes = require('./modules/prevision-dashboards/prevision.routes');
const planosFinanceirosSiengeRoutes = require('./modules/planos-financeiros-sienge/planos.routes');
const centrosCustoSiengeRoutes = require('./modules/centros-custo-sienge/centros.routes');
const mascarasRoutes = require('./modules/mascaras/mascaras.routes');
const contasBancariasSiengeRoutes = require('./modules/contas-bancarias-sienge/contas.routes');
const saldoContasBancariasRoutes = require('./modules/saldo-contas-bancarias/saldos.routes');
const classificacoesBancariasRoutes = require('./modules/classificacoes-bancarias/classificacoes.routes');
const dreCategoriasOrcamentoRoutes = require('./modules/dre-categorias-orcamento/categoriasOrcamento.routes');
const dreOrcamentoRoutes = require('./modules/dre-orcamento/orcamento.routes');
const dfcMascarasRoutes = require('./modules/dfc-mascaras/dfcMascaras.routes');
const dfcParametrosRoutes = require('./modules/dfc-parametros/dfcParametros.routes');
const dfcCentrosRoutes = require('./modules/dfc-centros/dfcCentros.routes');
const dfcPlanoContasRoutes = require('./modules/dfc-plano-contas/dfcPlanoContas.routes');
const dfcAvancosRoutes = require('./modules/dfc-avancos/dfcAvancos.routes');
const dfcRepassesRoutes = require('./modules/dfc-repasses/dfcRepasses.routes');
const dfcProjecaoCefRoutes = require('./modules/dfc-projecao-cef/projecaoCef.routes');
const dfcOrcamentoInformadoRoutes = require('./modules/dfc-orcamento-informado/orcamentoInformado.routes');
const dfcAgingRoutes = require('./modules/dfc-aging/dfcAging.routes');
const dfcOrcamentoRoutes = require('./modules/dfc-orcamento/dfcOrcamento.routes');
const dfcDesembolsoRoutes = require('./modules/dfc-desembolso/desembolso.routes');
const dfcEmpresarialRoutes = require('./modules/dfc-empresarial/dfcEmpresarial.routes');
const dfcContasRoutes = require('./modules/dfc-contas/dfcContas.routes');
const dfcSaldosRoutes = require('./modules/dfc-saldos/dfcSaldos.routes');
const dfcDetalhamentoRoutes = require('./modules/dfc-detalhamento/detalhamento.routes');
const dfcExportacaoRoutes = require('./modules/dfc-exportacao/exportacao.routes');
const dashboardsRoutes = require('./modules/dashboards/dashboards.routes');
const bancosRoutes = require('./modules/bancos/bancos.routes');
const eprRoutes = require('./modules/epr/epr.routes');
const dcdRoutes = require('./modules/dcd/dcd.routes');
const extratoRoutes = require('./modules/extrato/extrato.routes');
const curvaObrasRoutes = require('./modules/curva-obras/curva.routes');
const cepRoutes = require('./modules/cep/cep.routes');
const periodosRoutes = require('./modules/periodos/periodos.routes');
const unidadesSiengeRoutes = require('./modules/unidades-sienge/unidades.routes');
const curvaVendasRoutes = require('./modules/curva-vendas/curva.routes');
const certificadosRoutes = require('./modules/certificados-digitais/certificados.routes');
const espiaoRoutes = require('./modules/espiao-nfe-nfse/espiao.routes');
const espiaoAgendador = require('./modules/espiao-nfe-nfse/agendador');
const monitorIntegracoesRoutes = require('./modules/monitor-integracoes/monitor.routes');
const monitorIntegracoesAgendador = require('./modules/monitor-integracoes/agendador');
const usuariosRoutes = require('./modules/usuarios/usuarios.routes');
const repassesCefRoutes = require('./modules/repasses-cef/repassesCef.routes');
const motorRiscoRoutes = require('./modules/motor-risco/motorRisco.routes');
const incomeSiengeRoutes = require('./modules/income-sienge/income.routes');
const outcomeSiengeRoutes = require('./modules/outcome-sienge/outcome.routes');
const businessBudgetSiengeRoutes = require('./modules/business-budget-sienge/businessBudget.routes');
const customersSiengeRoutes = require('./modules/customers-sienge/customers.routes');
const cobrancaClustersRoutes = require('./modules/cobranca-clusters/cobrancaClusters.routes');
const gestaoParcelasRoutes = require('./modules/gestao-parcelas/gestaoParcelas.routes');
const reguaCobrancaRoutes = require('./modules/regua-cobranca/reguaCobranca.routes');
const historicoClienteRoutes = require('./modules/regua-cobranca-historico/historicoCliente.routes');
const comunicacaoRoutes = require('./modules/comunicacao/comunicacao.routes');
const rotinasRoutes = require('./modules/rotinas/rotinas.routes');
const mcpRoutes = require('./modules/integracoes-mcp/mcp.routes');
const mcpProtocoloRoutes = require('./modules/integracoes-mcp/mcpProtocolo.routes');
const mcpDfcRoutes = require('./modules/integracoes-mcp/dfc/mcpDfc.routes');
const mcpOauthRoutes = require('./modules/integracoes-mcp/dfc/oauth.routes');
const logsAcessoRoutes = require('./modules/logs-acesso/logsAcesso.routes');
const errorMiddleware = require('./middlewares/error.middleware');
const { QUALQUER_TELA, exigirTela, exigirMaster, exigirAdministradorDaTela } = require('./middlewares/acesso.middleware');
const T = require('./config/telas');
const { limiteGeral, limiteDownloadsSeAplicavel, limiteLogin, limiteMcp } = require('./middlewares/rateLimit.middleware');
const pool = require('./config/db');

const app = express();
// Em produção a API fica atrás do Nginx do host (1 salto) — sem isso o IP
// de todo mundo seria o do Nginx e o limite por IP valeria pro sistema
// inteiro de uma vez só.
app.set('trust proxy', 1);

const allowedOrigins = [env.frontendUrl, env.frontendUrl.replace('localhost', '127.0.0.1')];
// O MCP do DFC e o OAuth dele são chamados pelo Claude / por qualquer cliente MCP — CORS próprio
// (aberto) nos routers deles; o resto da API segue só com as origens do sistema.
const corsSistema = cors({ origin: allowedOrigins, credentials: true });
const ROTAS_CORS_PROPRIO = ['/.well-known/', '/api/mcp-oauth', '/api/mcp/dfc/'];
app.use((req, res, next) => (ROTAS_CORS_PROPRIO.some((p) => req.path.startsWith(p)) ? next() : corsSistema(req, res, next)));
// Limite maior que o padrão (100kb) por causa da foto de usuário, enviada
// como data URI (base64) dentro do JSON do cadastro.
app.use(express.json({ limit: '5mb' }));
// O token do conector MCP vai na própria URL (/api/mcp/<token>) — sem essa
// exceção, todo request do Claude apareceria com o segredo em texto puro no
// log do Morgan/stdout do container.
app.use(morgan('dev', { skip: (req) => req.path.startsWith('/api/mcp/') }));

// Limite de chamadas (ver rateLimit.middleware.js). O /api/health fica de
// fora (monitoramento), o MCP tem o limite próprio, por token.
app.use('/api/mcp', limiteMcp);
app.use('/api/auth/login', limiteLogin);
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/mcp/')) return next();
  return limiteGeral(req, res, () => limiteDownloadsSeAplicavel(req, res, next));
});

// Sem autenticação de propósito — usado por monitoramento/deploy pra
// confirmar que o processo está de pé e consegue falar com o banco.
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

// Acesso por tela (perfil Básico) — o mesmo cadastro de "Telas que possui
// acesso" do usuário, aplicado aqui no backend: sem a tela, a API responde
// 403 mesmo que alguém chame direto pelo navegador. A 2ª lista de cada
// exigirTela libera só leitura (GET) pra telas que apenas consultam aquela
// API. A empresa é conferida dentro de cada módulo (auth.middleware.js e
// router.param, ver acesso.middleware.js).
app.use('/api/auth', authRoutes);
app.use('/api', usersRoutes);
app.use('/api/clientes', exigirTela([]), exigirMaster, clientesRoutes);
app.use('/api/empresas', exigirTela([T.EMPRESAS], [QUALQUER_TELA]), empresasRoutes);
app.use('/api/integracoes/sienge', exigirTela([T.SIENGE], [T.COBRANCAS]), siengeRoutes);
app.use('/api/integracoes/zapi', exigirTela([T.ZAPI], [T.COBRANCAS, T.SALDOS, T.REPASSES]), zapiRoutes);
app.use('/api/integracoes/convenios-bancarios/vanpix', exigirTela([T.CONVENIOS]), vanpixRoutes);
app.use('/api/integracoes/convenios-bancarios/itau', exigirTela([T.CONVENIOS], [T.EXTRATOS]), itauRoutes);
app.use('/api/integracoes/email', exigirTela([T.EMAIL], [T.COBRANCAS]), emailIntegracaoRoutes);
app.use('/api/integracoes/construtor-de-vendas', exigirTela([T.CONSTRUTOR_VENDAS]), construtorVendasRoutes);
app.use('/api/integracoes/actioon', exigirTela([T.ACTIOON]), actioonRoutes);
app.use('/api/integracoes/banco-dados', exigirTela([T.BANCO_DADOS]), bancoDadosRoutes);
app.use('/api/relatorios/empreendimentos-masa', exigirTela([T.MASA]), relatorioMasaRoutes);
app.use('/api/relatorios/notas-pendentes', exigirTela([T.ACERVO_NOTAS]), relatorioNotasPendentesRoutes);
app.use('/api/relatorios/extratos-bancarios', exigirTela([T.EXTRATOS]), relatorioExtratosRoutes);
app.use('/api/relatorios/repasses-cef', exigirTela([T.REL_REPASSES]), relatorioRepassesCefRoutes);
app.use('/api/relatorios/desempenho-cobranca', exigirTela([T.REL_DESEMPENHO_COBRANCA]), relatorioDesempenhoCobrancaRoutes);
app.use('/api/projetos', exigirTela([QUALQUER_TELA]), projetosRoutes);
app.use('/api/integracoes/prevision', exigirTela([T.PREVISION], [T.CENTROS_CUSTO]), previsionRoutes);
app.use('/api/prevision-dashboards', exigirTela([T.PREVISION, T.CENTROS_CUSTO]), previsionDashboardsRoutes);
// Também na aba Plano Contas da DFC Construtoras (espelho do cadastro de Planos Financeiros).
app.use('/api/planos-financeiros/sienge', exigirTela([T.PLANOS_FINANCEIROS, T.SIENGE, T.DRE, T.DFC]), planosFinanceirosSiengeRoutes);
app.use('/api/centros-custo/sienge', exigirTela([T.CENTROS_CUSTO, T.SIENGE], [T.DRE]), centrosCustoSiengeRoutes);
app.use('/api/mascaras', exigirTela([T.MASCARAS, T.DRE, T.REPASSES], [T.CENTROS_CUSTO, T.PLANOS_FINANCEIROS]), mascarasRoutes);
// Abas de cadastro do Saldo Contas Bancárias: Contas Bancárias e Classificação
// só pro Administrador da tela; Bancos só Master.
app.use('/api/contas-bancarias/sienge', exigirTela([T.SALDOS]), exigirAdministradorDaTela(T.SALDOS), contasBancariasSiengeRoutes);
app.use('/api/saldo-contas-bancarias', exigirTela([T.SALDOS]), saldoContasBancariasRoutes);
app.use('/api/classificacoes-bancarias', exigirTela([T.SALDOS]), exigirAdministradorDaTela(T.SALDOS), classificacoesBancariasRoutes);
app.use('/api/dre-categorias-orcamento', exigirTela([T.DRE]), dreCategoriasOrcamentoRoutes);
app.use('/api/dre-orcamento', exigirTela([T.DRE]), dreOrcamentoRoutes);
app.use('/api/dfc-mascaras', exigirTela([T.DFC]), dfcMascarasRoutes);
app.use('/api/dfc-parametros', exigirTela([T.DFC]), dfcParametrosRoutes);
app.use('/api/dfc-centros', exigirTela([T.DFC]), dfcCentrosRoutes);
app.use('/api/dfc-plano-contas', exigirTela([T.DFC]), dfcPlanoContasRoutes);
app.use('/api/dfc-avancos', exigirTela([T.DFC]), dfcAvancosRoutes);
app.use('/api/dfc-repasses', exigirTela([T.DFC]), dfcRepassesRoutes);
app.use('/api/dfc-projecao-cef', exigirTela([T.DFC]), dfcProjecaoCefRoutes);
app.use('/api/dfc-orcamento-informado', exigirTela([T.DFC]), dfcOrcamentoInformadoRoutes);
app.use('/api/dfc-aging', exigirTela([T.DFC]), dfcAgingRoutes);
app.use('/api/dfc-orcamento', exigirTela([T.DFC]), dfcOrcamentoRoutes);
app.use('/api/dfc-desembolso', exigirTela([T.DFC]), dfcDesembolsoRoutes);
app.use('/api/dfc-empresarial', exigirTela([T.DFC]), dfcEmpresarialRoutes);
app.use('/api/dfc-contas', exigirTela([T.DFC]), dfcContasRoutes);
app.use('/api/dfc-saldos', exigirTela([T.DFC]), dfcSaldosRoutes);
app.use('/api/dfc-detalhamento', exigirTela([T.DFC]), dfcDetalhamentoRoutes);
app.use('/api/dfc-exportacao', exigirTela([T.DFC]), dfcExportacaoRoutes);
app.use('/api/dashboards', exigirTela([T.ECONOMICO_FINANCEIRO]), dashboardsRoutes);
app.use('/api/bancos', exigirTela([T.SALDOS]), exigirMaster, bancosRoutes);
app.use('/api/epr', exigirTela([T.PORTAL]), eprRoutes);
// DCD e Extrato também na aba CIWEB da DFC Construtoras (espelho do Portal das Construtoras,
// inclusive importando por lá).
app.use('/api/dcd', exigirTela([T.PORTAL, T.DFC]), dcdRoutes);
app.use('/api/extrato', exigirTela([T.PORTAL, T.DFC]), extratoRoutes);
app.use('/api/curva-obras', exigirTela([]), curvaObrasRoutes);
app.use('/api/cep', exigirTela([QUALQUER_TELA]), cepRoutes);
app.use('/api/periodos', exigirTela([]), periodosRoutes);
app.use('/api/unidades/sienge', exigirTela([T.SIENGE]), unidadesSiengeRoutes);
app.use('/api/curva-vendas', exigirTela([]), curvaVendasRoutes);
app.use('/api/certificados', exigirTela([T.CERTIFICADOS]), certificadosRoutes);
app.use('/api/espiao', exigirTela([T.ESPIAO], [T.ACERVO_NOTAS]), espiaoRoutes);
app.use('/api/monitor-integracoes', exigirTela([T.MONITOR]), monitorIntegracoesRoutes);
app.use('/api/usuarios', exigirTela([T.USUARIOS]), usuariosRoutes);
app.use('/api/repasses-cef', exigirTela([T.REPASSES], [T.COBRANCAS]), repassesCefRoutes);
app.use('/api/motor-risco', exigirTela([T.COBRANCAS]), motorRiscoRoutes);
app.use('/api/income-sienge', exigirTela([T.COBRANCAS]), incomeSiengeRoutes);
app.use('/api/outcome-sienge', exigirTela([T.DFC]), outcomeSiengeRoutes);
app.use('/api/business-budget-sienge', exigirTela([T.DFC]), businessBudgetSiengeRoutes);
app.use('/api/customers-sienge', exigirTela([T.COBRANCAS]), customersSiengeRoutes);
app.use('/api/cobranca-clusters', exigirTela([T.COBRANCAS]), cobrancaClustersRoutes);
app.use('/api/gestao-parcelas', exigirTela([T.COBRANCAS]), gestaoParcelasRoutes);
app.use('/api/regua-cobranca', exigirTela([T.COBRANCAS]), reguaCobrancaRoutes);
// Leitura liberada também pro relatório Desempenho da Cobrança (o clique em
// Interações abre o Histórico da Parcela); registrar continua só na Cobrança.
app.use('/api/regua-cobranca-historico', exigirTela([T.COBRANCAS], [T.REL_DESEMPENHO_COBRANCA]), historicoClienteRoutes);
app.use('/api/comunicacao', exigirTela([T.COBRANCAS]), comunicacaoRoutes);
app.use('/api/rotinas', exigirTela([T.COBRANCAS]), rotinasRoutes);
app.use('/api/integracoes/mcp', exigirTela([T.MCP]), mcpRoutes);
// MCP do DFC Construtoras (login Horizon via OAuth): metadados na raiz do site (/.well-known), o
// servidor de autorização em /api/mcp-oauth e o MCP em /api/mcp/dfc/<token> — antes do /api/mcp/:token.
app.use('/.well-known', mcpOauthRoutes.wellKnown);
app.use('/api/mcp-oauth', mcpOauthRoutes.router);
app.use('/api/mcp/dfc', mcpDfcRoutes);
app.use('/api/mcp', mcpProtocoloRoutes);
app.use('/api/logs-acesso/metricas', exigirTela([T.METRICAS]));
app.use('/api/logs-acesso', logsAcessoRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Rota não encontrada.' });
});

app.use(errorMiddleware);

app.listen(env.port, () => {
  console.log(`Horizon Fin API rodando em http://localhost:${env.port}`);
  // Ambiente de desenvolvimento (cópia do banco de produção): sem agendadores, senão o dev
  // consultaria SEFAZ/Sienge/Itaú e renovaria certificados em duplicidade com a VPS.
  if (!env.agendadoresAtivos) {
    console.log('[agendadores] desativados (AGENDADORES_ATIVOS=false) — nenhuma rotina automática vai rodar.');
    return;
  }
  espiaoAgendador.iniciar();
  monitorIntegracoesAgendador.iniciar();
});
