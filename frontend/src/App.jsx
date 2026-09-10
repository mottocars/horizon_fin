import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ConfirmProvider } from './confirm/ConfirmContext';
import ProtectedRoute from './auth/ProtectedRoute';
import AppShell from './layout/AppShell';
import Login from './pages/Login/Login';
import Home from './pages/Home/Home';
import ComingSoon from './pages/ComingSoon/ComingSoon';
import EmpresasList from './pages/Empresas/EmpresasList';
import EmpresaNova from './pages/Empresas/EmpresaNova';
import EmpresaDetalhe from './pages/Empresas/EmpresaDetalhe';
import SiengeList from './pages/Integracoes/Sienge/SiengeList';
import SiengeForm from './pages/Integracoes/Sienge/SiengeForm';
import ZapiList from './pages/Integracoes/Zapi/ZapiList';
import ZapiForm from './pages/Integracoes/Zapi/ZapiForm';
import McpList from './pages/Integracoes/Mcp/McpList';
import McpForm from './pages/Integracoes/Mcp/McpForm';
import EmailList from './pages/Integracoes/Email/EmailList';
import EmailForm from './pages/Integracoes/Email/EmailForm';
import ConstrutorVendasList from './pages/Integracoes/ConstrutorVendas/ConstrutorVendasList';
import ConstrutorVendasForm from './pages/Integracoes/ConstrutorVendas/ConstrutorVendasForm';
import PrevisionList from './pages/Integracoes/Prevision/PrevisionList';
import PrevisionForm from './pages/Integracoes/Prevision/PrevisionForm';
import CertificadosDigitaisPage from './pages/Integracoes/CertificadosDigitais/CertificadosDigitaisPage';
import EspiaoNfeNfsePage from './pages/Operacoes/EspiaoNfe/EspiaoNfeNfsePage';
import PlanosFinanceirosList from './pages/PlanosFinanceiros/PlanosFinanceirosList';
import PlanoFinanceiroDetalhe from './pages/PlanosFinanceiros/PlanoFinanceiroDetalhe';
import PlanoFinanceiroItemDetalhe from './pages/PlanosFinanceiros/PlanoFinanceiroItemDetalhe';
import CentrosCustoList from './pages/CentrosCusto/CentrosCustoList';
import CentroCustoDetalhe from './pages/CentrosCusto/CentroCustoDetalhe';
import CentroCustoItemDetalhe from './pages/CentrosCusto/CentroCustoItemDetalhe';
import MascarasPage from './pages/Mascaras/MascarasPage';
import ContasBancariasList from './pages/ContasBancarias/ContasBancariasList';
import ContaBancariaDetalhe from './pages/ContasBancarias/ContaBancariaDetalhe';
import ContaBancariaItemDetalhe from './pages/ContasBancarias/ContaBancariaItemDetalhe';
import PortalConstrutorasPage from './pages/Integracoes/PortalConstrutoras/PortalConstrutorasPage';
import CurvaDeObrasPage from './pages/Operacoes/CurvaDeObras/CurvaDeObrasPage';
import CurvaDeVendasPage from './pages/Operacoes/CurvaDeVendas/CurvaDeVendasPage';
import PeriodosPage from './pages/Periodos/PeriodosPage';
import MapaDeUnidadesPage from './pages/MapaDeUnidades/MapaDeUnidadesPage';
import UsuariosList from './pages/Usuarios/UsuariosList';
import UsuarioForm from './pages/Usuarios/UsuarioForm';
import MeuPerfil from './pages/MeuPerfil/MeuPerfil';
import PrimeiroAcesso from './pages/PrimeiroAcesso/PrimeiroAcesso';
import RepassesCefPage from './pages/Operacoes/RepassesCef/RepassesCefPage';
import GestaoCobrancasPage from './pages/Operacoes/GestaoCobrancas/GestaoCobrancasPage';
import ClusterClientesList from './pages/Operacoes/GestaoCobrancas/ClustersCobranca/ClusterClientesList';
import ClienteClusterDetalhe from './pages/Operacoes/GestaoCobrancas/ClustersCobranca/ClienteClusterDetalhe';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ConfirmProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/primeiro-acesso"
            element={
              <ProtectedRoute>
                <PrimeiroAcesso />
              </ProtectedRoute>
            }
          />

          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Home />} />
            <Route path="/meu-perfil" element={<MeuPerfil />} />

            <Route
              path="/operacoes/projecoes-financeiras"
              element={
                <ComingSoon
                  title="Projeções Financeiras"
                  description="Operações — Projeções Financeiras — em desenvolvimento."
                />
              }
            />
            <Route path="/operacoes/curva-de-vendas" element={<CurvaDeVendasPage />} />
            <Route path="/operacoes/curva-de-obras" element={<CurvaDeObrasPage />} />
            <Route path="/operacoes/espiao-nfe-nfse" element={<EspiaoNfeNfsePage />} />
            <Route
              path="/operacoes/saldo-contas-bancarias"
              element={
                <ComingSoon
                  title="Saldo Contas Bancárias"
                  description="Operações — Saldo Contas Bancárias — em desenvolvimento."
                />
              }
            />
            <Route path="/operacoes/repasses-cef" element={<RepassesCefPage />} />
            <Route path="/operacoes/gestao-de-cobrancas" element={<GestaoCobrancasPage />} />
            <Route path="/operacoes/gestao-de-cobrancas/clusters/:cluster" element={<ClusterClientesList />} />
            <Route
              path="/operacoes/gestao-de-cobrancas/clusters/:cluster/:clientId"
              element={<ClienteClusterDetalhe />}
            />

            <Route path="/cadastros/empresas" element={<EmpresasList />} />
            <Route path="/cadastros/empresas/nova" element={<EmpresaNova />} />
            <Route path="/cadastros/empresas/:id" element={<EmpresaDetalhe />} />
            <Route path="/cadastros/usuarios" element={<UsuariosList />} />
            <Route path="/cadastros/usuarios/novo" element={<UsuarioForm />} />
            <Route path="/cadastros/usuarios/:id" element={<UsuarioForm />} />
            <Route path="/cadastros/mascaras" element={<MascarasPage />} />
            <Route path="/cadastros/centros-de-custo" element={<CentrosCustoList />} />
            <Route
              path="/cadastros/centros-de-custo/:empresaId"
              element={<CentroCustoDetalhe />}
            />
            <Route
              path="/cadastros/centros-de-custo/:empresaId/:siengeId"
              element={<CentroCustoItemDetalhe />}
            />
            <Route path="/cadastros/planos-financeiros" element={<PlanosFinanceirosList />} />
            <Route
              path="/cadastros/planos-financeiros/:empresaId"
              element={<PlanoFinanceiroDetalhe />}
            />
            <Route
              path="/cadastros/planos-financeiros/:empresaId/:siengeId"
              element={<PlanoFinanceiroItemDetalhe />}
            />
            <Route path="/cadastros/periodos" element={<PeriodosPage />} />
            <Route path="/cadastros/mapa-de-unidades" element={<MapaDeUnidadesPage />} />
            <Route path="/cadastros/contas-bancarias" element={<ContasBancariasList />} />
            <Route path="/cadastros/contas-bancarias/:empresaId" element={<ContaBancariaDetalhe />} />
            <Route
              path="/cadastros/contas-bancarias/:empresaId/:companyId/:numeroConta"
              element={<ContaBancariaItemDetalhe />}
            />

            <Route
              path="/integracoes/portal-das-construtoras"
              element={<PortalConstrutorasPage />}
            />
            <Route path="/integracoes/sienge" element={<SiengeList />} />
            <Route path="/integracoes/sienge/nova" element={<SiengeForm />} />
            <Route path="/integracoes/sienge/:id" element={<SiengeForm />} />
            <Route path="/integracoes/prevision" element={<PrevisionList />} />
            <Route path="/integracoes/prevision/nova" element={<PrevisionForm />} />
            <Route path="/integracoes/prevision/:id" element={<PrevisionForm />} />
            <Route path="/integracoes/construtor-de-vendas" element={<ConstrutorVendasList />} />
            <Route path="/integracoes/construtor-de-vendas/nova" element={<ConstrutorVendasForm />} />
            <Route path="/integracoes/construtor-de-vendas/:id" element={<ConstrutorVendasForm />} />
            <Route
              path="/integracoes/certificados-digitais"
              element={<CertificadosDigitaisPage />}
            />
            <Route
              path="/integracoes/conta-azul"
              element={
                <ComingSoon
                  title="Conta Azul"
                  description="Integração — Conta Azul — em desenvolvimento."
                />
              }
            />
            <Route
              path="/integracoes/contas-bancarias"
              element={
                <ComingSoon
                  title="Contas Bancárias"
                  description="Integração — Contas Bancárias — em desenvolvimento."
                />
              }
            />
            <Route path="/integracoes/z-api" element={<ZapiList />} />
            <Route path="/integracoes/z-api/nova" element={<ZapiForm />} />
            <Route path="/integracoes/z-api/:id" element={<ZapiForm />} />
            <Route path="/integracoes/email" element={<EmailList />} />
            <Route path="/integracoes/email/nova" element={<EmailForm />} />
            <Route path="/integracoes/email/:id" element={<EmailForm />} />
            <Route path="/integracoes/mcp" element={<McpList />} />
            <Route path="/integracoes/mcp/nova" element={<McpForm />} />
            <Route path="/integracoes/mcp/:id" element={<McpForm />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ConfirmProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
