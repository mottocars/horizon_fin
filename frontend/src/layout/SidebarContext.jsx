import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const SidebarContext = createContext(null);

// O menu agora é puramente dirigido por hover (ver Sidebar.jsx): começa
// sempre recolhido e expande temporariamente ao passar o mouse por cima,
// sem estado "fixado" persistido. `forceCollapsed` é o único estado
// controlado por fora — um recolhimento forçado e temporário usado por
// telas que precisam de mais espaço horizontal (ex.: painel de filtro do
// Espião NFe/NFSe), que impede a expansão por hover enquanto ativo.
export function SidebarProvider({ children }) {
  const [forceCollapsed, setForceCollapsed] = useState(false);

  const collapseTemporarily = useCallback(() => setForceCollapsed(true), []);
  const restoreCollapse = useCallback(() => setForceCollapsed(false), []);

  const value = useMemo(
    () => ({ forceCollapsed, collapseTemporarily, restoreCollapse }),
    [forceCollapsed, collapseTemporarily, restoreCollapse]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar deve ser usado dentro de SidebarProvider');
  return ctx;
}
