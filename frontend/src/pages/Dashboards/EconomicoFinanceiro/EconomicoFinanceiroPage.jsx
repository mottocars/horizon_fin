import ControlesDashboard from '../ControlesDashboard';

// Dashboards > Econômico Financeiro — a tela inteira é do dashboard (só o menu lateral fica, ver
// AppShell.jsx), com os botões Menu e Filtros (barras com as telas do dashboard e os filtros da tela).
// Telas e filtros ainda serão definidos (pedido do usuário).
export default function EconomicoFinanceiroPage() {
  return (
    <div className="h-full w-full">
      <ControlesDashboard />
    </div>
  );
}
