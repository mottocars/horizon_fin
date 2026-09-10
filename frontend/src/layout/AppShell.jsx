import { Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { SidebarProvider } from './SidebarContext';
import { useAuth } from '../auth/AuthContext';
import { temAcessoATela } from '../utils/permissoes';

const pageMeta = {
  '/': { title: 'Home', subtitle: 'Visão geral das suas atividades' },
  '/meu-perfil': { title: 'Meu Perfil', subtitle: 'Altere seus dados de acesso' },
  '/operacoes/projecoes-financeiras': { title: 'Projeções Financeiras', subtitle: 'Operações — Projeções Financeiras' },
  '/operacoes/curva-de-vendas': { title: 'Curva de Vendas', subtitle: 'Operações — Curva de Vendas' },
  '/operacoes/curva-de-obras': { title: 'Curva de Obras', subtitle: 'Operações — Curva de Obras' },
  '/operacoes/espiao-nfe-nfse': { title: 'Espião NFe / NFSe', subtitle: 'Operações — Espião NFe / NFSe' },
  '/operacoes/saldo-contas-bancarias': { title: 'Saldo Contas Bancárias', subtitle: 'Operações — Saldo Contas Bancárias' },
  '/operacoes/repasses-cef': { title: 'Repasses CEF', subtitle: 'Operações — Repasses CEF' },
  '/operacoes/gestao-de-cobrancas': { title: 'Gestão de Cobranças', subtitle: 'Operações — Gestão de Cobranças' },
  '/cadastros/empresas': { title: 'Empresas', subtitle: 'Cadastros — Empresas' },
  '/cadastros/usuarios': { title: 'Usuários', subtitle: 'Cadastros — Usuários' },
  '/cadastros/mascaras': { title: 'Máscaras', subtitle: 'Cadastros — Máscaras' },
  '/cadastros/centros-de-custo': { title: 'Centros de Custos', subtitle: 'Cadastros — Centros de Custos' },
  '/cadastros/planos-financeiros': { title: 'Planos Financeiros', subtitle: 'Cadastros — Planos Financeiros' },
  '/cadastros/periodos': { title: 'Períodos', subtitle: 'Cadastros — Períodos' },
  '/cadastros/mapa-de-unidades': { title: 'Mapa de Unidades', subtitle: 'Cadastros — Mapa de Unidades' },
  '/cadastros/contas-bancarias': { title: 'Contas Bancárias', subtitle: 'Cadastros — Contas Bancárias' },
  '/integracoes/portal-das-construtoras': { title: 'Portal das Construtoras', subtitle: 'Integrações — Portal das Construtoras' },
  '/integracoes/sienge': { title: 'Sienge', subtitle: 'Integrações — Sienge' },
  '/integracoes/prevision': { title: 'Prevision', subtitle: 'Integrações — Prevision' },
  '/integracoes/construtor-de-vendas': { title: 'Construtor de Vendas', subtitle: 'Integrações — Construtor de Vendas' },
  '/integracoes/certificados-digitais': { title: 'Certificados Digitais', subtitle: 'Integrações — Certificados Digitais' },
  '/integracoes/conta-azul': { title: 'Conta Azul', subtitle: 'Integrações — Conta Azul' },
  '/integracoes/contas-bancarias': { title: 'Contas Bancárias', subtitle: 'Integrações — Contas Bancárias' },
  '/integracoes/z-api': { title: 'Whatsapp Z-API', subtitle: 'Integrações — Whatsapp Z-API' },
  '/integracoes/email': { title: 'Email', subtitle: 'Integrações — Email' },
  '/integracoes/mcp': { title: 'MCP', subtitle: 'Integrações — MCP' },
};

function resolveMeta(pathname) {
  if (pageMeta[pathname]) return pageMeta[pathname];

  if (pathname === '/cadastros/empresas/nova') {
    return { title: 'Nova Empresa', subtitle: 'Cadastros — Empresas — Nova' };
  }
  if (/^\/cadastros\/empresas\/[^/]+$/.test(pathname)) {
    return { title: 'Detalhes da Empresa', subtitle: 'Cadastros — Empresas' };
  }
  if (/^\/cadastros\/contas-bancarias\/[^/]+$/.test(pathname)) {
    return { title: 'Contas Bancárias', subtitle: 'Cadastros — Contas Bancárias' };
  }
  if (/^\/cadastros\/contas-bancarias\/[^/]+\/[^/]+\/[^/]+$/.test(pathname)) {
    return { title: 'Detalhes da Conta Bancária', subtitle: 'Cadastros — Contas Bancárias' };
  }
  if (pathname === '/integracoes/sienge/nova') {
    return { title: 'Nova Integração Sienge', subtitle: 'Integrações — Sienge — Nova' };
  }
  if (/^\/integracoes\/sienge\/[^/]+$/.test(pathname)) {
    return { title: 'Editar Integração Sienge', subtitle: 'Integrações — Sienge' };
  }
  if (pathname === '/integracoes/z-api/nova') {
    return { title: 'Nova Conexão Whatsapp Z-API', subtitle: 'Integrações — Whatsapp Z-API — Nova' };
  }
  if (/^\/integracoes\/z-api\/[^/]+$/.test(pathname)) {
    return { title: 'Editar Conexão Whatsapp Z-API', subtitle: 'Integrações — Whatsapp Z-API' };
  }
  if (pathname === '/integracoes/email/nova') {
    return { title: 'Nova Conexão de Email', subtitle: 'Integrações — Email — Nova' };
  }
  if (/^\/integracoes\/email\/[^/]+$/.test(pathname)) {
    return { title: 'Editar Conexão de Email', subtitle: 'Integrações — Email' };
  }
  if (pathname === '/integracoes/construtor-de-vendas/nova') {
    return {
      title: 'Nova Integração Construtor de Vendas',
      subtitle: 'Integrações — Construtor de Vendas — Nova',
    };
  }
  if (/^\/integracoes\/construtor-de-vendas\/[^/]+$/.test(pathname)) {
    return { title: 'Editar Integração Construtor de Vendas', subtitle: 'Integrações — Construtor de Vendas' };
  }
  if (/^\/cadastros\/planos-financeiros\/[^/]+$/.test(pathname)) {
    return { title: 'Plano de Contas', subtitle: 'Cadastros — Planos Financeiros' };
  }
  if (/^\/cadastros\/centros-de-custo\/[^/]+$/.test(pathname)) {
    return { title: 'Centros de Custo', subtitle: 'Cadastros — Centros de Custos' };
  }
  if (/^\/cadastros\/centros-de-custo\/[^/]+\/[^/]+$/.test(pathname)) {
    return { title: 'Detalhes do Centro de Custo', subtitle: 'Cadastros — Centros de Custos' };
  }
  if (pathname === '/cadastros/usuarios/novo') {
    return { title: 'Novo Usuário', subtitle: 'Cadastros — Usuários — Novo' };
  }
  if (/^\/cadastros\/usuarios\/[^/]+$/.test(pathname)) {
    return { title: 'Editar Usuário', subtitle: 'Cadastros — Usuários' };
  }

  return { title: 'Horizon Fin', subtitle: '' };
}

function AcessoRestrito() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-sm rounded-card bg-white p-8 text-center shadow-card">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
          <ShieldAlert size={22} />
        </div>
        <p className="text-sm font-semibold text-gray-900">Acesso restrito</p>
        <p className="mt-1 text-sm text-gray-500">
          Você não tem permissão para acessar esta tela. Fale com um administrador se precisar de acesso.
        </p>
      </div>
    </div>
  );
}

export default function AppShell() {
  const location = useLocation();
  const { user } = useAuth();
  const meta = resolveMeta(location.pathname);
  // Home é sempre acessível, então acessoPermitido nunca bloqueia '/'.
  const acessoPermitido = temAcessoATela(user, location.pathname);

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-app-bg">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar title={meta.title} subtitle={meta.subtitle} />
          {/* scrollbar-gutter: stable reserva o espaço da barra de rolagem
              sempre, mesmo quando o conteúdo não enche a tela — sem isso,
              uma página mais alta que rola fica alguns pixels mais estreita
              que uma página mais curta que não rola (a barra "come" espaço
              só numa delas), fazendo cards do mesmo CSS parecerem tamanhos
              diferentes entre telas. */}
          <main className="flex-1 overflow-y-auto p-6" style={{ scrollbarGutter: 'stable' }}>
            {acessoPermitido ? <Outlet /> : <AcessoRestrito />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
