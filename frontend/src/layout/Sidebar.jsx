import { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSidebar } from './SidebarContext';
import { useAuth } from '../auth/AuthContext';
import { temAcessoATela } from '../utils/permissoes';
import {
  LayoutDashboard,
  FolderKanban,
  ArrowLeftRight,
  Plug,
  ChevronDown,
  Users,
  SlidersHorizontal,
  Building2,
  PieChart,
  Building,
  FileSearch,
  Landmark,
  Banknote,
  ReceiptText,
  FileBarChart,
  Activity,
  BarChart3,
} from 'lucide-react';
import iconPortalConstrutoras from '../assets/integracoes/portal-construtoras.svg';
import iconPrevision from '../assets/integracoes/prevision.svg';
import iconSienge from '../assets/integracoes/sienge.svg';
import iconConstrutorVendas from '../assets/integracoes/construtor-vendas.svg';
import iconCertificadosDigitais from '../assets/integracoes/certificados-digitais.svg';
import iconZapi from '../assets/integracoes/zapi.svg';
import iconEmail from '../assets/integracoes/email.svg';
import iconMcp from '../assets/integracoes/mcp.svg';

const menuItems = [
  { type: 'link', label: 'Home', to: '/', icon: LayoutDashboard },
  {
    type: 'group',
    label: 'Cadastros',
    icon: FolderKanban,
    basePath: '/cadastros',
    children: [
      { label: 'Empresas', to: '/cadastros/empresas', icon: Building },
      { label: 'Usuários', to: '/cadastros/usuarios', icon: Users },
      { label: 'Máscaras', to: '/cadastros/mascaras', icon: SlidersHorizontal },
      { label: 'Centros de Custos', to: '/cadastros/centros-de-custo', icon: Building2 },
      { label: 'Planos Financeiros', to: '/cadastros/planos-financeiros', icon: PieChart },
    ],
  },
  {
    type: 'group',
    label: 'Operações',
    icon: ArrowLeftRight,
    basePath: '/operacoes',
    children: [
      { label: 'DRE Gerencial', to: '/operacoes/dre-gerencial', icon: BarChart3 },
      { label: 'Espião NFe / NFSe', to: '/operacoes/espiao-nfe-nfse', icon: FileSearch },
      { label: 'Saldo Contas Bancárias', to: '/operacoes/saldo-contas-bancarias', icon: Landmark },
      { label: 'Repasses CEF', to: '/operacoes/repasses-cef', icon: Banknote },
      { label: 'Gestão de Cobranças', to: '/operacoes/gestao-de-cobrancas', icon: ReceiptText },
    ],
  },
  {
    type: 'group',
    label: 'Integrações',
    icon: Plug,
    basePath: '/integracoes',
    children: [
      { label: 'Portal das Construtoras', to: '/integracoes/portal-das-construtoras', image: iconPortalConstrutoras },
      { label: 'Prevision', to: '/integracoes/prevision', image: iconPrevision },
      { label: 'Sienge', to: '/integracoes/sienge', image: iconSienge },
      { label: 'Construtor de Vendas', to: '/integracoes/construtor-de-vendas', image: iconConstrutorVendas },
      { label: 'Certificados Digitais', to: '/integracoes/certificados-digitais', image: iconCertificadosDigitais },
      { label: 'Convênios Bancários', to: '/integracoes/contas-bancarias', icon: Landmark },
      { label: 'Whatsapp Z-API', to: '/integracoes/z-api', image: iconZapi },
      { label: 'Email', to: '/integracoes/email', image: iconEmail },
      { label: 'MCP', to: '/integracoes/mcp', image: iconMcp },
    ],
  },
  {
    type: 'group',
    label: 'Relatórios',
    icon: FileBarChart,
    basePath: '/relatorios',
    children: [
      { label: 'Métricas de Uso', to: '/relatorios/metricas-de-uso', icon: Activity },
    ],
  },
];

export default function Sidebar() {
  const location = useLocation();
  const { user } = useAuth();
  const { forceCollapsed } = useSidebar();
  // Puramente hover: nenhum estado "fixado" — some assim que o mouse sai.
  const [hovering, setHovering] = useState(false);
  const collapsed = forceCollapsed || !hovering;

  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    menuItems.forEach((item) => {
      if (item.type === 'group') {
        initial[item.label] = location.pathname.startsWith(item.basePath);
      }
    });
    return initial;
  });

  // Master/Administrador veem tudo. Básico só vê as telas liberadas pra
  // ele — grupo some inteiro se nenhum item dele estiver liberado.
  const menuVisivel = useMemo(() => {
    return menuItems
      .map((item) => {
        if (item.type === 'link') {
          return temAcessoATela(user, item.to) ? item : null;
        }
        const children = item.children.filter((child) => temAcessoATela(user, child.to));
        return children.length > 0 ? { ...item, children } : null;
      })
      .filter(Boolean);
  }, [user]);

  // Comportamento de acordeão: só um grupo fica aberto por vez — abrir um
  // fecha automaticamente qualquer outro que estivesse aberto. Só clique
  // abre/fecha o submenu (hover é só pra expandir o menu inteiro — deixar o
  // grupo abrindo no hover também deixava a navegação rápida demais/nervosa
  // ao passar o mouse por cima pra alcançar um item mais abaixo).
  function toggleGrupo(label) {
    setOpenGroups((prev) => (prev[label] ? {} : { [label]: true }));
  }

  return (
    <aside
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={`flex h-screen shrink-0 flex-col bg-linear-to-b from-white to-[#fbfcff] shadow-[1px_0_0_rgba(15,23,42,0.05),8px_0_28px_-18px_rgba(15,23,42,0.35)] transition-all duration-200 ${
        collapsed ? 'w-[76px]' : 'w-64'
      }`}
    >
        <div className="relative z-10 flex h-14 items-center justify-center gap-2 px-3 shadow-[0_1px_0_rgba(15,23,42,0.05)]">
          {collapsed ? (
            // Recolhido: mostra só o ícone da marca, recortando a logomarca
            // completa (ícone + texto) numa janela estreita o bastante pra
            // não deixar nenhum pedaço do texto aparecer.
            <div className="h-8 w-[23px] shrink-0 overflow-hidden">
              <img src="/logomarca.svg" alt="Horizon Fin" className="h-8 w-auto max-w-none" />
            </div>
          ) : (
            <img src="/logomarca.svg" alt="Horizon Fin" className="h-8 w-auto" />
          )}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
          {menuVisivel.map((item) => {
            const Icon = item.icon;

            if (item.type === 'group') {
              const isOpen = collapsed ? false : Boolean(openGroups[item.label]);
              const isActiveGroup = location.pathname.startsWith(item.basePath);

              return (
                <div key={item.label}>
                  <button
                    type="button"
                    title={collapsed ? item.label : undefined}
                    onClick={() => toggleGrupo(item.label)}
                    className={`flex items-center gap-2.5 rounded-[10px] text-[13px] font-medium transition-colors ${
                      collapsed ? 'mx-auto h-8 w-8 justify-center' : 'w-full px-2.5 py-1.5'
                    } ${
                      isActiveGroup
                        ? 'bg-primary-500 text-white shadow-[0_6px_14px_-6px_rgba(59,130,246,0.45)]'
                        : 'text-gray-600 hover:bg-[#f2f6fd] hover:text-[#233047]'
                    }`}
                  >
                    <Icon size={17} className="shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left">{item.label}</span>
                        <ChevronDown
                          size={14}
                          className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </>
                    )}
                  </button>

                  {!collapsed && (
                    // Truque do grid-rows 0fr/1fr pra animar até "altura automática"
                    // (max-height fixo não serve pois a lista tem tamanhos diferentes).
                    <div
                      className={`grid transition-all duration-200 ease-in-out ${
                        isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="mt-0.5 space-y-0.5 pl-3.5">
                          {item.children.map((child) => {
                            const ChildIcon = child.icon;
                            return (
                              <NavLink
                                key={child.to}
                                to={child.to}
                                className={({ isActive }) =>
                                  `flex items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-[13px] transition-colors ${
                                    isActive
                                      ? 'bg-linear-to-b from-primary-500/10 to-primary-500/3 font-medium text-primary-700'
                                      : 'text-gray-500 hover:bg-[#f2f6fd] hover:text-[#27324a]'
                                  }`
                                }
                              >
                                {child.image ? (
                                  <img src={child.image} alt="" className="h-3.5 w-3.5 shrink-0" />
                                ) : (
                                  <ChildIcon size={14} className="shrink-0" />
                                )}
                                <span>{child.label}</span>
                              </NavLink>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.to === '/'}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-[10px] text-[13px] font-medium transition-colors ${
                    collapsed ? 'mx-auto h-8 w-8 justify-center' : 'w-full px-2.5 py-1.5'
                  } ${
                    isActive
                      ? 'bg-primary-500 text-white shadow-[0_6px_14px_-6px_rgba(59,130,246,0.45)]'
                      : 'text-gray-600 hover:bg-[#f2f6fd] hover:text-[#233047]'
                  }`
                }
              >
                <Icon size={17} className="shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
      </nav>
    </aside>
  );
}
