import { Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { SidebarProvider } from './SidebarContext';
import { useAuth } from '../auth/AuthContext';
import { temAcessoATela } from '../utils/permissoes';
import { TELAS_SISTEMA } from '../config/telas';
import { useLogAcesso } from '../hooks/useLogAcesso';

function resolveMeta(pathname) {
  if (TELAS_SISTEMA[pathname]) return TELAS_SISTEMA[pathname];

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
  // Só conta como "acesso" quando a tela realmente é exibida (não quando
  // esbarra no Acesso restrito) — ver useLogAcesso.
  useLogAcesso(location.pathname, acessoPermitido);

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
