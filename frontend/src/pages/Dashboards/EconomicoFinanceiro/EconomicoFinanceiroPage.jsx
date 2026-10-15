import BotoesFlutuantes from '../BotoesFlutuantes';

// Dashboards > Econômico Financeiro — a tela inteira é do dashboard (só o menu lateral fica, ver
// AppShell.jsx). Por enquanto só os botões flutuantes Menu e Filtros (pedido do usuário); o
// conteúdo será definido depois.
export default function EconomicoFinanceiroPage() {
  return (
    <div className="h-full w-full">
      <BotoesFlutuantes />
    </div>
  );
}
