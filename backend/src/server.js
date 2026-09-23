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
const emailIntegracaoRoutes = require('./modules/integracoes-email/email.routes');
const construtorVendasRoutes = require('./modules/integracoes-construtor-vendas/construtorVendas.routes');
const previsionRoutes = require('./modules/integracoes-prevision/prevision.routes');
const previsionDashboardsRoutes = require('./modules/prevision-dashboards/prevision.routes');
const planosFinanceirosSiengeRoutes = require('./modules/planos-financeiros-sienge/planos.routes');
const centrosCustoSiengeRoutes = require('./modules/centros-custo-sienge/centros.routes');
const mascarasRoutes = require('./modules/mascaras/mascaras.routes');
const contasBancariasSiengeRoutes = require('./modules/contas-bancarias-sienge/contas.routes');
const saldoContasBancariasRoutes = require('./modules/saldo-contas-bancarias/saldos.routes');
const classificacoesBancariasRoutes = require('./modules/classificacoes-bancarias/classificacoes.routes');
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
const pool = require('./config/db');

const app = express();

const allowedOrigins = [env.frontendUrl, env.frontendUrl.replace('localhost', '127.0.0.1')];
app.use(cors({ origin: allowedOrigins, credentials: true }));
// Limite maior que o padrão (100kb) por causa da foto de usuário, enviada
// como data URI (base64) dentro do JSON do cadastro.
app.use(express.json({ limit: '5mb' }));
// O token do conector MCP vai na própria URL (/api/mcp/<token>) — sem essa
// exceção, todo request do Claude apareceria com o segredo em texto puro no
// log do Morgan/stdout do container.
app.use(morgan('dev', { skip: (req) => req.path.startsWith('/api/mcp/') }));

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

app.use('/api/auth', authRoutes);
app.use('/api', usersRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/empresas', empresasRoutes);
app.use('/api/integracoes/sienge', siengeRoutes);
app.use('/api/integracoes/zapi', zapiRoutes);
app.use('/api/integracoes/convenios-bancarios/vanpix', vanpixRoutes);
app.use('/api/integracoes/email', emailIntegracaoRoutes);
app.use('/api/integracoes/construtor-de-vendas', construtorVendasRoutes);
app.use('/api/integracoes/prevision', previsionRoutes);
app.use('/api/prevision-dashboards', previsionDashboardsRoutes);
app.use('/api/planos-financeiros/sienge', planosFinanceirosSiengeRoutes);
app.use('/api/centros-custo/sienge', centrosCustoSiengeRoutes);
app.use('/api/mascaras', mascarasRoutes);
app.use('/api/contas-bancarias/sienge', contasBancariasSiengeRoutes);
app.use('/api/saldo-contas-bancarias', saldoContasBancariasRoutes);
app.use('/api/classificacoes-bancarias', classificacoesBancariasRoutes);
app.use('/api/bancos', bancosRoutes);
app.use('/api/epr', eprRoutes);
app.use('/api/dcd', dcdRoutes);
app.use('/api/extrato', extratoRoutes);
app.use('/api/curva-obras', curvaObrasRoutes);
app.use('/api/cep', cepRoutes);
app.use('/api/periodos', periodosRoutes);
app.use('/api/unidades/sienge', unidadesSiengeRoutes);
app.use('/api/curva-vendas', curvaVendasRoutes);
app.use('/api/certificados', certificadosRoutes);
app.use('/api/espiao', espiaoRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/repasses-cef', repassesCefRoutes);
app.use('/api/motor-risco', motorRiscoRoutes);
app.use('/api/income-sienge', incomeSiengeRoutes);
app.use('/api/customers-sienge', customersSiengeRoutes);
app.use('/api/cobranca-clusters', cobrancaClustersRoutes);
app.use('/api/gestao-parcelas', gestaoParcelasRoutes);
app.use('/api/regua-cobranca', reguaCobrancaRoutes);
app.use('/api/regua-cobranca-historico', historicoClienteRoutes);
app.use('/api/comunicacao', comunicacaoRoutes);
app.use('/api/rotinas', rotinasRoutes);
app.use('/api/integracoes/mcp', mcpRoutes);
app.use('/api/mcp', mcpProtocoloRoutes);
app.use('/api/logs-acesso', logsAcessoRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Rota não encontrada.' });
});

app.use(errorMiddleware);

app.listen(env.port, () => {
  console.log(`Horizon Fin API rodando em http://localhost:${env.port}`);
  espiaoAgendador.iniciar();
});
