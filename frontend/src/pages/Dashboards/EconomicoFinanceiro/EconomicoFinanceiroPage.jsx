import { useSearchParams } from 'react-router-dom';
import { BarChart3, CalendarClock, FileSearch, Landmark, Wallet } from 'lucide-react';
import ControlesDashboard from '../ControlesDashboard';

// Dashboards > Econômico Financeiro — a tela inteira é do dashboard (só o menu lateral fica, ver
// AppShell.jsx), com o botão de menu (painel com as telas do dashboard e os filtros da tela).
// Telas do dashboard (pedido do usuário); a escolhida fica na URL (?tela=), a primeira é o padrão.
// O conteúdo de cada tela e os filtros ainda serão definidos.
const TELAS = [
  { id: 'dre', label: 'Demonstração do Resultado', icon: BarChart3 },
  { id: 'fluxo-caixa', label: 'Fluxo de Caixa', icon: Wallet },
  { id: 'aging', label: 'Aging List', icon: CalendarClock },
  { id: 'detalhamento', label: 'Detalhamento Financeiro', icon: FileSearch },
  { id: 'saldos', label: 'Saldo das Contas', icon: Landmark },
];

export default function EconomicoFinanceiroPage() {
  const [params, setParams] = useSearchParams();
  const telaAtiva = TELAS.some((t) => t.id === params.get('tela')) ? params.get('tela') : TELAS[0].id;

  function escolherTela(id) {
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual);
        novo.set('tela', id);
        return novo;
      },
      { replace: true }
    );
  }

  return (
    <div className="h-full w-full">
      <ControlesDashboard telas={TELAS} telaAtiva={telaAtiva} onTela={escolherTela} />
    </div>
  );
}
