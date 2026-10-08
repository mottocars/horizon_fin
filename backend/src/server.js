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
const customersSiengeRoutes = require('./modules/customers-sienge/customers.routes');
const cobrancaClustersRoutes = require('./modules/cobranca-clusters/cobrancaClusters.routes');
const gestaoParcelasRoutes = require('./modules/gestao-parcelas/gestaoParcelas.routes');
const reguaCobrancaRoutes = require('./modules/regua-cobranca/reguaCobranca.routes');
const historicoClienteRoutes = require('./modules/regua-cobranca-historico/historicoCliente.routes');
const comunicacaoRoutes = require('./modules/comunicacao/comunicacao.routes');
const rotinasRoutes = require('./modules/rotinas/rotinas.routes');
const mcpRoutes = require('./modules/integracoes-mcp/mcp.routes');
const mcpProtocoloRoutes = require('./modules/integracoes-mcp/mcpProtocolo.routes');
const logsAcessoRoutes = require('./modules/logs-acesso/logsAcesso.routes');
const errorMiddleware = require('./middlewares/error.middleware');
const { QUALQUER_TELA, exigirTela, exigirMaster } = require('./middlewares/acesso.middleware');
const T = require('./config/telas');
const { limiteGeral, limiteDownloadsSeAplicavel, limiteLogin, limiteMcp } = require('./middlewares/rateLimit.middleware');
const pool = require('./config/db');

const app = express();
// Em produção a API fica atrás do Nginx do host (1 salto) — sem isso o IP
// de todo mundo seria o do Nginx e o limite por IP valeria pro sistema
// inteiro de uma vez só.
app.set('trust proxy', 1);

const allowedOrigins = [env.frontendUrl, env.frontendUrl.replace('localhost', '127.0.0.1')];
app.use(cors({ origin: allowedOrigins, credentials: true }));
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
app.use('/api/planos-financeiros/sienge', exigirTela([T.PLANOS_FINANCEIROS, T.SIENGE, T.DRE]), planosFinanceirosSiengeRoutes);
app.use('/api/centros-custo/sienge', exigirTela([T.CENTROS_CUSTO, T.SIENGE], [T.DRE]), centrosCustoSiengeRoutes);
app.use('/api/mascaras', exigirTela([T.MASCARAS, T.DRE, T.REPASSES], [T.CENTROS_CUSTO, T.PLANOS_FINANCEIROS]), mascarasRoutes);
app.use('/api/contas-bancarias/sienge', exigirTela([T.SALDOS]), contasBancariasSiengeRoutes);
app.use('/api/saldo-contas-bancarias', exigirTela([T.SALDOS]), saldoContasBancariasRoutes);
app.use('/api/classificacoes-bancarias', exigirTela([T.SALDOS]), classificacoesBancariasRoutes);
app.use('/api/dre-categorias-orcamento', exigirTela([T.DRE]), dreCategoriasOrcamentoRoutes);
app.use('/api/dre-orcamento', exigirTela([T.DRE]), dreOrcamentoRoutes);
app.use('/api/bancos', exigirTela([T.SALDOS]), bancosRoutes);
app.use('/api/epr', exigirTela([T.PORTAL]), eprRoutes);
app.use('/api/dcd', exigirTela([T.PORTAL]), dcdRoutes);
app.use('/api/extrato', exigirTela([T.PORTAL]), extratoRoutes);
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
app.use('/api/customers-sienge', exigirTela([T.COBRANCAS]), customersSiengeRoutes);
app.use('/api/cobranca-clusters', exigirTela([T.COBRANCAS]), cobrancaClustersRoutes);
app.use('/api/gestao-parcelas', exigirTela([T.COBRANCAS]), gestaoParcelasRoutes);
app.use('/api/regua-cobranca', exigirTela([T.COBRANCAS]), reguaCobrancaRoutes);
app.use('/api/regua-cobranca-historico', exigirTela([T.COBRANCAS]), historicoClienteRoutes);
app.use('/api/comunicacao', exigirTela([T.COBRANCAS]), comunicacaoRoutes);
app.use('/api/rotinas', exigirTela([T.COBRANCAS]), rotinasRoutes);
app.use('/api/integracoes/mcp', exigirTela([T.MCP]), mcpRoutes);
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
