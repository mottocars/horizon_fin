import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const SidebarContext = createContext(null);

// O menu (ver Sidebar.jsx) começa sempre recolhido, expande ao clicar nele e
// recolhe sozinho quando o mouse sai, sem estado "fixado" persistido.
// `forceCollapsed` é o único estado controlado por fora — um recolhimento
// forçado e temporário usado por telas que precisam de mais espaço
// horizontal (ex.: painel de filtro do Espião NFe/NFSe), que impede a
// expansão enquanto ativo.
// `expandido` (aberto pelo clique) mora aqui, e não dentro do Sidebar, pra as telas saberem quando o
// menu está aberto (`menuAberto`) — ex.: a DRE Construtoras tira os ícones das abas nesse momento.
export function SidebarProvider({ children }) {
  const [forceCollapsed, setForceCollapsed] = useState(false);
  const [expandido, setExpandido] = useState(false);

  const collapseTemporarily = useCallback(() => setForceCollapsed(true), []);
  const restoreCollapse = useCallback(() => setForceCollapsed(false), []);

  const menuAberto = expandido && !forceCollapsed;

  const value = useMemo(
    () => ({ forceCollapsed, collapseTemporarily, restoreCollapse, expandido, setExpandido, menuAberto }),
    [forceCollapsed, collapseTemporarily, restoreCollapse, expandido, menuAberto]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar deve ser usado dentro de SidebarProvider');
  return ctx;
}
